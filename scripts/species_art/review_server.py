"""Local review contact sheet: http://127.0.0.1:8765

Serves review_page.html, the card data built from state.json, and image files under
species/work and species/images. Verdicts are POSTed back and written atomically to
species/work/review.json, which `apply-review` reads.

Item ids are "<job_id>:<method>" (method "raw" = the untouched generation).
"""

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import catalogue, selection
from .config import PKG_DIR, PROMPT_DIR, REPO, REVIEW_PATH, SPECIES_DIR
from .state import State, atomic_write_json, now

VERDICTS = {"approve", "reroll", "reject", "accept", ""}


def load_review():
    if REVIEW_PATH.exists():
        return json.loads(REVIEW_PATH.read_text())
    return {"items": {}, "picks": {}}


def _ids_for(stage, set_name):
    if stage == "pilot":
        return selection.PILOT_IDS
    if stage == "transparency":
        return selection.TRANSPARENCY_IDS
    if set_name:
        return selection.read_set(set_name)
    return None  # everything


def build_cards(stage=None, set_name=None):
    cat = catalogue.load()
    st = State()
    ids = _ids_for(stage, set_name)
    cards = []
    for sid in (ids if ids is not None else sorted(cat)):
        sp = cat[sid]
        items = []
        for j in st.jobs_for_species(sid):
            if j["status"] != "done":
                continue
            if stage in ("pilot", "transparency") and j["stage"] != stage and not (
                    stage == "transparency" and j["bg"] == "B"):
                continue
            base = {"job": j["id"], "model": j["model"], "quality": j["quality"], "style": j["style"],
                    "bg": j["bg"], "attempt": j["attempt"], "cost": round(j["cost_usd"], 4),
                    "prompt": j["prompt"], "flags": j["flags"], "note": j.get("note")}
            items.append({**base, "id": f"{j['id']}:raw", "method": "raw", "src": "/files/" + j["raw_path"]})
            for key, c in st.species(sid)["cutouts"].items():
                jid, method = key.split(":")
                if jid == j["id"]:
                    items.append({**base, "id": key, "method": method, "src": "/files/" + c["path"],
                                  "flags": j["flags"] + c["stats"]["flags"], "stats": c["stats"]})
        cards.append({"id": sid, "key": sp.key, "group": sp.group, "prototype": sp.prototype,
                      "planetoids": sp.planetoids, "body_plan": sp.body_plan, "curated": sp.curated,
                      "status": st.species(sid).get("status", "new"), "items": items})
    return cards


def build_prompt_cards(stage):
    path = PROMPT_DIR / f"{stage}.jsonl"
    if not path.exists():
        return []
    cat = catalogue.load()
    by_sid = {}
    for line in path.read_text().splitlines():
        j = json.loads(line)
        sp = cat[j["species_id"]]
        card = by_sid.setdefault(sp.id, {
            "id": sp.id, "key": sp.key, "group": sp.group, "prototype": sp.prototype,
            "planetoids": sp.planetoids, "body_plan": sp.body_plan, "curated": sp.curated,
            "image_notes": sp.image_notes, "status": "prompt", "items": []})
        card["items"].append({"id": f"prompt:{sp.id}:{len(card['items'])}", "method": "prompt",
                              "model": j["model"], "quality": j["quality"], "style": j["style"],
                              "bg": j["bg"], "prompt": j["prompt"], "est": j["est_usd"], "flags": []})
    return list(by_sid.values())


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/":
            return self._send(200, (PKG_DIR / "review_page.html").read_bytes(), "text/html; charset=utf-8")
        if u.path == "/api/cards":
            if q.get("view") == "prompts":
                return self._send(200, build_prompt_cards(q.get("stage", "all")))
            return self._send(200, build_cards(q.get("stage") or None, q.get("set") or None))
        if u.path == "/api/review":
            return self._send(200, load_review())
        if u.path.startswith("/files/"):
            target = (REPO / u.path[len("/files/"):]).resolve()
            if not target.is_relative_to(SPECIES_DIR.resolve()) or not target.is_file():
                return self._send(404, {"error": "not found"})
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            return self._send(200, target.read_bytes(), ctype)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "bad json"})
        rv = load_review()
        if u.path == "/api/verdict":
            if body.get("verdict", "") not in VERDICTS or not body.get("item"):
                return self._send(400, {"error": "bad verdict"})
            rv["items"][body["item"]] = {"species_id": int(body["species_id"]),
                                         "verdict": body.get("verdict", ""),
                                         "notes": str(body.get("notes", ""))[:2000], "updated": now()}
        elif u.path == "/api/pick":
            rv["picks"][str(int(body["species_id"]))] = body.get("item") or None
        else:
            return self._send(404, {"error": "not found"})
        atomic_write_json(REVIEW_PATH, rv)
        return self._send(200, {"ok": True})


def serve(port=8765):
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"review page: http://127.0.0.1:{port}/   (Ctrl+C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
