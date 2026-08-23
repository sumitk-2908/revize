from dotenv import load_dotenv

load_dotenv()
from app.main import app

lines = []


def walk(routes, depth=0):
    for route in routes:
        nested = getattr(route, "routes", None) or getattr(route, "router", None)
        path = getattr(route, "path", None)
        methods = sorted(getattr(route, "methods", []) or [])
        prefix = getattr(route, "prefix", "")
        lines.append(
            f"{'  ' * depth}{type(route).__name__} prefix={prefix!r} "
            f"path={path!r} methods={methods}"
        )
        if isinstance(nested, list):
            walk(nested, depth + 1)
        elif nested is not None and hasattr(nested, "routes"):
            walk(nested.routes, depth + 1)


walk(app.routes)

with open("_routes_check.out", "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines) + "\n")
