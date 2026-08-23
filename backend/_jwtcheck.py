import base64
import json

from jose import jwt

for label, token in {
    "stripped": "header."
    + base64.urlsafe_b64encode(json.dumps({"aal": "aal1"}).encode()).decode().rstrip("=")
    + ".signature",
    "padded": "header."
    + base64.urlsafe_b64encode(json.dumps({"aal": "aal1"}).encode()).decode()
    + ".signature",
}.items():
    try:
        print(label, "->", jwt.get_unverified_claims(token))
    except Exception as error:  # noqa: BLE001
        print(label, "-> FAILED:", type(error).__name__, error)
