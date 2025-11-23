import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from transformers import AutoTokenizer

HOST = "127.0.0.1"
PORT = 8009

TOKENIZER = AutoTokenizer.from_pretrained(
    "Qwen/Qwen2.5-7B-Instruct",
    use_fast=True
)

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/qwen/tokenize":
            self.send_response(404)
            self.end_headers()
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))
            text = data.get("text", "")

            encoding = TOKENIZER(
                text,
                add_special_tokens=False,
                return_offsets_mapping=True
            )

            offsets = encoding["offset_mapping"]
            tokens = [text[s:e] for (s, e) in offsets]

            result = {
                "count": len(tokens),
                "tokens": tokens,
                "offsets": offsets,
            }

            body = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

def main():
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Qwen token server listening on http://{HOST}:{PORT}/qwen/tokenize")
    server.serve_forever()

if __name__ == "__main__":
    main()
