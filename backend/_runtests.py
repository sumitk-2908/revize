import sys

from dotenv import load_dotenv

load_dotenv()

import pytest

sys.exit(
    pytest.main(
        [
            "tests/test_ai_content.py",
            "-q",
            "--no-header",
            "-p",
            "no:cacheprovider",
            "-k",
            "test_every_ai_content_route_is_mounted",
            "-x",
            "-rA",
        ]
    )
)
