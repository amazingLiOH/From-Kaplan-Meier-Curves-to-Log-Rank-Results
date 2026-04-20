import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DEFAULT_MODEL = "gpt-5.4"
MAX_ARMS = 2


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_label(value, fallback):
    text = str(value or "").strip()
    return text or fallback


def get_requested_arm_labels(payload):
    left = str(payload.get("leftArm") or "").strip()
    right = str(payload.get("rightArm") or "").strip()
    labels = [label for label in [left, right] if label]

    if len(labels) < 2:
        raw_labels = payload.get("armLabels")
        if isinstance(raw_labels, list):
            labels = [str(item).strip() for item in raw_labels[:MAX_ARMS] if str(item).strip()]

    if len(labels) < 2:
        labels = ["Treatment A", "Treatment B"]

    if len(labels) == 1:
        labels.append("Treatment B")

    if labels[0].casefold() == labels[1].casefold():
        labels[1] = "Treatment B" if labels[0] != "Treatment B" else "Treatment A"

    return labels[:MAX_ARMS]


def json_response(handler, status_code, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler):
    length = parse_int(handler.headers.get("Content-Length"), 0)
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON body: {exc}") from exc


def strip_code_fences(text):
    candidate = (text or "").strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        candidate = "\n".join(lines).strip()
    return candidate


def normalize_responses_endpoint(base_url):
    base = str(base_url or "").strip() or "https://api.openai.com"
    trimmed = base.rstrip("/")
    if trimmed.endswith("/responses"):
        return trimmed
    if trimmed.endswith("/v1"):
        return f"{trimmed}/responses"
    return f"{trimmed}/v1/responses"


def km_schema():
    return {
        "type": "object",
        "properties": {
            "study_label": {"type": "string"},
            "arms": {
                "type": "array",
                "minItems": 2,
                "maxItems": MAX_ARMS,
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "estimated_n": {"type": "integer", "minimum": 1},
                        "estimated_events": {"type": "integer", "minimum": 0},
                    },
                    "required": ["label", "estimated_n", "estimated_events"],
                    "additionalProperties": False,
                },
            },
            "event_table": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "arm": {"type": "string"},
                        "time": {"type": "number", "minimum": 0},
                        "event_count": {"type": "integer", "minimum": 0},
                        "censor_count": {"type": "integer", "minimum": 0},
                        "survival_after_time": {
                            "type": "number",
                            "minimum": 0,
                            "maximum": 1,
                        },
                    },
                    "required": [
                        "arm",
                        "time",
                        "event_count",
                        "censor_count",
                        "survival_after_time",
                    ],
                    "additionalProperties": False,
                },
            },
            "numbers_at_risk": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "time": {"type": "number", "minimum": 0},
                        "arm_counts": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": MAX_ARMS,
                            "items": {"type": "integer", "minimum": 0},
                        },
                    },
                    "required": ["time", "arm_counts"],
                    "additionalProperties": False,
                },
            },
            "reported_logrank": {
                "type": "object",
                "properties": {
                    "p_value": {"type": "number", "minimum": 0, "maximum": 1},
                    "chi_square": {"type": "number", "minimum": 0},
                    "degrees_freedom": {"type": "integer", "minimum": 1},
                    "reported_text": {"type": "string"},
                },
                "additionalProperties": False,
            },
            "notes": {"type": "array", "items": {"type": "string"}},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "study_label",
            "arms",
            "event_table",
            "numbers_at_risk",
            "notes",
            "warnings",
        ],
        "additionalProperties": False,
    }


def build_extraction_prompt(payload):
    arm_labels = get_requested_arm_labels(payload)
    time_unit = normalize_label(payload.get("timeUnit"), "months")
    context = str(payload.get("studyContext") or "").strip() or "None supplied."
    study_label = str(payload.get("studyLabel") or "").strip() or " vs ".join(arm_labels)
    x_axis_max = str(payload.get("xAxisMax") or "").strip() or "Not supplied."
    numbers_at_risk = str(payload.get("numbersAtRisk") or "").strip() or "Not supplied."
    arm_label_block = "\n".join(f"{index + 1}. {label}" for index, label in enumerate(arm_labels))

    return f"""
You are reconstructing approximate survival data from a Kaplan-Meier figure.

Target study label: {study_label}
Arm labels in legend/order supplied by the user:
{arm_label_block}
Time unit: {time_unit}
Maximum x-axis time if known: {x_axis_max}
Numbers-at-risk text supplied by the user: {numbers_at_risk}
Study context from the user: {context}

Instructions:
1. Inspect the Kaplan-Meier image and identify exactly {len(arm_labels)} survival curves.
2. Use the supplied arm labels above as the exact output groups, in the same order.
3. Do not add extra groups beyond the supplied list.
4. Do not collapse the supplied list into fewer groups unless the image truly makes one arm impossible to distinguish; if that happens, keep the missing arm label anyway and explain the ambiguity in warnings.
5. Output an event table in ascending time order. Each row is a distinct time for one arm.
6. `event_count` should reflect downward step changes in the curve at that time.
7. `censor_count` should reflect censor tick marks at that time when visible. If censor marks are too hard to count exactly, provide your best conservative estimate and mention it in warnings.
8. `survival_after_time` is the arm-specific survival probability immediately after that time, between 0 and 1.
9. Keep counts integer-valued and internally consistent with any numbers-at-risk text shown in the figure or provided above.
10. Prefer fewer, cleaner rows over overfitting noise. If the image is ambiguous, note that uncertainty in warnings.
11. If the figure explicitly prints a log-rank p-value, chi-square, or degrees of freedom, capture it in `reported_logrank`. If nothing is printed, omit `reported_logrank`.
12. Do not fabricate article metadata. If the title is not visible, keep the supplied study label.
13. Return only valid JSON matching the schema.
""".strip()


def extract_output_text(response_payload):
    if isinstance(response_payload.get("output_text"), str):
        return response_payload["output_text"]

    for item in response_payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if isinstance(content.get("text"), str):
                return content["text"]
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    return ""


def call_responses_json(endpoint, api_key, model, prompt_text, image_data_url, schema_name, schema):
    request_payload = {
        "model": model,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt_text},
                    {"type": "input_image", "image_url": image_data_url, "detail": "high"},
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "strict": True,
                "schema": schema,
            }
        },
        "store": False,
    }

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read().decode("utf-8")
            response_payload = json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")
        raise RuntimeError(f"LLM API error ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach the LLM API endpoint: {exc.reason}") from exc

    text = strip_code_fences(extract_output_text(response_payload))
    if not text:
        raise RuntimeError("The LLM API returned no structured output.")

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Structured output was not valid JSON: {exc}") from exc


def call_llm_extraction(payload):
    api_key = str(payload.get("apiKey") or "").strip()
    if not api_key:
        raise ValueError("Missing API key. Enter your own API key in the website before extracting.")

    image_data_url = str(payload.get("imageDataUrl") or "").strip()
    if not image_data_url.startswith("data:image/"):
        raise ValueError("Upload a Kaplan-Meier figure image before extracting.")

    endpoint = normalize_responses_endpoint(payload.get("apiBaseUrl"))
    model = str(payload.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    effective_payload = dict(payload)
    effective_payload["armLabels"] = get_requested_arm_labels(payload)

    parsed = call_responses_json(
        endpoint,
        api_key,
        model,
        build_extraction_prompt(effective_payload),
        image_data_url,
        "km_extraction",
        km_schema(),
    )

    return parsed, effective_payload, model, endpoint


def normalize_extraction_result(raw_result, request_payload, model, endpoint):
    requested_labels = get_requested_arm_labels(request_payload)
    fallback_allowed = {label.casefold(): label for label in requested_labels}

    notes = [str(item).strip() for item in raw_result.get("notes", []) if str(item).strip()]
    warnings = [str(item).strip() for item in raw_result.get("warnings", []) if str(item).strip()]
    study_label = (
        str(raw_result.get("study_label") or "").strip()
        or str(request_payload.get("studyLabel") or "").strip()
        or " vs ".join(requested_labels)
    )

    arms_payload = raw_result.get("arms", [])
    arm_summaries = []
    raw_arm_count = len(requested_labels)
    for index in range(min(raw_arm_count, MAX_ARMS)):
        fallback = requested_labels[index] if index < len(requested_labels) else f"Treatment {chr(65 + index)}"
        arm_data = arms_payload[index] if index < len(arms_payload) else {}
        arm_label = normalize_label(arm_data.get("label"), fallback)
        arm_label = fallback_allowed.get(arm_label.casefold(), arm_label)
        arm_summaries.append(
            {
                "label": arm_label,
                "estimated_n": max(1, parse_int(arm_data.get("estimated_n"), 1)),
                "estimated_events": max(0, parse_int(arm_data.get("estimated_events"), 0)),
            }
        )

    allowed = {summary["label"] for summary in arm_summaries}

    event_table = []
    expanded_records = []
    for row in raw_result.get("event_table", []):
        arm = normalize_label(row.get("arm"), arm_summaries[0]["label"])
        arm = fallback_allowed.get(arm.casefold(), arm)
        if arm not in allowed:
            continue
        time_value = max(0.0, parse_float(row.get("time"), 0.0))
        event_count = max(0, parse_int(row.get("event_count"), 0))
        censor_count = max(0, parse_int(row.get("censor_count"), 0))
        survival_after_time = clamp(parse_float(row.get("survival_after_time"), 1.0), 0.0, 1.0)
        if event_count == 0 and censor_count == 0:
            continue

        event_table.append(
            {
                "arm": arm,
                "time": round(time_value, 4),
                "event_count": event_count,
                "censor_count": censor_count,
                "survival_after_time": round(survival_after_time, 6),
            }
        )
        expanded_records.extend(
            {"arm": arm, "time": round(time_value, 4), "event": 1}
            for _ in range(event_count)
        )
        expanded_records.extend(
            {"arm": arm, "time": round(time_value, 4), "event": 0}
            for _ in range(censor_count)
        )

    event_table.sort(key=lambda row: (row["time"], row["arm"]))
    expanded_records.sort(key=lambda row: (row["time"], -row["event"], row["arm"]))

    if not expanded_records:
        raise RuntimeError("The LLM returned an empty event table. Try a clearer image or add numbers at risk.")

    record_counts = {}
    event_counts = {}
    for row in expanded_records:
        record_counts[row["arm"]] = record_counts.get(row["arm"], 0) + 1
        if row["event"]:
            event_counts[row["arm"]] = event_counts.get(row["arm"], 0) + 1

    for summary in arm_summaries:
        label = summary["label"]
        summary["estimated_n"] = max(summary["estimated_n"], record_counts.get(label, 0))
        summary["estimated_events"] = max(summary["estimated_events"], event_counts.get(label, 0))

    missing_labels = [summary["label"] for summary in arm_summaries if summary["label"] not in record_counts]
    if missing_labels:
        warnings.append(
            "Could not confidently reconstruct all requested arms. Missing event rows for: "
            + ", ".join(missing_labels)
            + "."
        )

    numbers_at_risk = []
    for row in raw_result.get("numbers_at_risk", []):
        counts = row.get("arm_counts", [])
        if len(counts) < len(arm_summaries):
            continue
        numbers_at_risk.append(
            {
                "time": round(max(0.0, parse_float(row.get("time"), 0.0)), 4),
                "arm_counts": [max(0, parse_int(value, 0)) for value in counts[: len(arm_summaries)]],
            }
        )
    numbers_at_risk.sort(key=lambda row: row["time"])

    reported_logrank = None
    raw_reported = raw_result.get("reported_logrank")
    if isinstance(raw_reported, dict):
        candidate = {}
        p_value = raw_reported.get("p_value")
        chi_square = raw_reported.get("chi_square")
        degrees_freedom = raw_reported.get("degrees_freedom")
        reported_text = str(raw_reported.get("reported_text") or "").strip()
        if p_value is not None:
            candidate["pValue"] = clamp(parse_float(p_value, 0.0), 0.0, 1.0)
        if chi_square is not None:
            candidate["chiSquare"] = max(0.0, parse_float(chi_square, 0.0))
        if degrees_freedom is not None:
            candidate["degreesFreedom"] = max(1, parse_int(degrees_freedom, 1))
        if reported_text:
            candidate["reportedText"] = reported_text
        if candidate:
            reported_logrank = candidate

    return {
        "studyLabel": study_label,
        "arms": arm_summaries,
        "eventTable": event_table,
        "records": expanded_records,
        "numbersAtRisk": numbers_at_risk,
        "reportedLogrank": reported_logrank,
        "notes": notes,
        "warnings": warnings,
        "timeUnit": normalize_label(request_payload.get("timeUnit"), "months"),
        "source": {
            "model": model,
            "endpoint": endpoint,
            "type": "llm_km_reconstruction",
        },
    }


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "KMIndirectCompare/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_xml(url):
    request = urllib.request.Request(url, headers={"User-Agent": "KMIndirectCompare/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return ET.fromstring(response.read().decode("utf-8"))


def build_pubmed_query(payload):
    left = normalize_label(payload.get("leftTreatment"), "Treatment A")
    right = normalize_label(payload.get("rightTreatment"), "Treatment B")
    condition = str(payload.get("condition") or "").strip()
    extra_keywords = str(payload.get("extraKeywords") or "").strip()

    terms = [
        f'"{left}"[Title/Abstract]',
        f'"{right}"[Title/Abstract]',
        '("Kaplan-Meier"[Title/Abstract] OR survival[Title/Abstract] OR randomized[Title/Abstract] OR trial[Title/Abstract])',
    ]
    if condition:
        terms.append(f'"{condition}"[Title/Abstract]')
    if extra_keywords:
        terms.append(f"({extra_keywords})")
    return " AND ".join(terms)


def search_pubmed(payload):
    query = build_pubmed_query(payload)
    retmax = clamp(parse_int(payload.get("limit"), 6), 1, 10)

    search_url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?"
        + urllib.parse.urlencode(
            {
                "db": "pubmed",
                "retmode": "json",
                "sort": "relevance",
                "retmax": retmax,
                "term": query,
            }
        )
    )
    search_json = fetch_json(search_url)
    ids = search_json.get("esearchresult", {}).get("idlist", [])
    if not ids:
        return {"query": query, "articles": []}

    summary_url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?"
        + urllib.parse.urlencode(
            {
                "db": "pubmed",
                "retmode": "json",
                "id": ",".join(ids),
            }
        )
    )
    summary_json = fetch_json(summary_url)
    summary_result = summary_json.get("result", {})

    abstract_url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?"
        + urllib.parse.urlencode(
            {
                "db": "pubmed",
                "retmode": "xml",
                "id": ",".join(ids),
            }
        )
    )
    abstract_xml = fetch_xml(abstract_url)
    abstract_map = {}
    for article in abstract_xml.findall(".//PubmedArticle"):
        pmid = article.findtext(".//PMID")
        chunks = []
        for abstract_text in article.findall(".//Abstract/AbstractText"):
            label = abstract_text.attrib.get("Label")
            text = "".join(abstract_text.itertext()).strip()
            if not text:
                continue
            chunks.append(f"{label}: {text}" if label else text)
        abstract_map[pmid] = " ".join(chunks)

    articles = []
    for pmid in ids:
        data = summary_result.get(pmid, {})
        title = str(data.get("title") or "").strip()
        article_ids = data.get("articleids", [])
        doi = ""
        for entry in article_ids:
            if entry.get("idtype") == "doi":
                doi = entry.get("value") or ""
                break

        authors = [author.get("name") for author in data.get("authors", []) if author.get("name")]
        articles.append(
            {
                "pmid": pmid,
                "title": title,
                "journal": data.get("fulljournalname") or data.get("source") or "",
                "pubdate": data.get("pubdate") or "",
                "authors": authors[:5],
                "doi": doi,
                "abstract": abstract_map.get(pmid, ""),
                "pubmedUrl": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            }
        )

    return {"query": query, "articles": articles}


class AppHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/health"):
            json_response(self, 200, {"ok": True})
            return

        requested = self.path.split("?", 1)[0]
        if requested in ("", "/"):
            target = STATIC_DIR / "index.html"
        else:
            relative = requested.lstrip("/")
            target = (STATIC_DIR / relative).resolve()
            if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.exists():
                self.send_error(404, "Not Found")
                return

        try:
            data = target.read_bytes()
        except FileNotFoundError:
            self.send_error(404, "Not Found")
            return

        content_type, _ = mimetypes.guess_type(target.name)
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        try:
            payload = read_json_body(self)
        except ValueError as exc:
            json_response(self, 400, {"error": str(exc)})
            return

        path = self.path.split("?", 1)[0]
        try:
            if path == "/api/extract":
                raw_result, effective_payload, model, endpoint = call_llm_extraction(payload)
                normalized = normalize_extraction_result(raw_result, effective_payload, model, endpoint)
                json_response(self, 200, {"study": normalized})
                return
            if path == "/api/pubmed/search":
                json_response(self, 200, search_pubmed(payload))
                return
        except ValueError as exc:
            json_response(self, 400, {"error": str(exc)})
            return
        except RuntimeError as exc:
            json_response(self, 502, {"error": str(exc)})
            return
        except urllib.error.URLError as exc:
            json_response(self, 502, {"error": f"Network error: {exc.reason}"})
            return
        except Exception as exc:  # pragma: no cover - defensive path
            json_response(self, 500, {"error": f"Unexpected server error: {exc}"})
            return

        json_response(self, 404, {"error": "Unknown endpoint"})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))


def main():
    default_host = "0.0.0.0" if os.getenv("PORT") else "127.0.0.1"
    host = os.getenv("HOST", default_host)
    port = parse_int(os.getenv("PORT"), 8000)
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Serving Curve to Contrast at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
