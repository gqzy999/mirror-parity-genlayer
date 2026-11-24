# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import hashlib
import json
import re
from genlayer import TreeMap, gl, u256


def majority(digests: list[str]) -> str:
    for digest in digests:
        if digests.count(digest) >= 2:
            return digest
    return ""


class MirrorParity(gl.Contract):
    expected: str
    package_path: str
    round: u256
    reports: TreeMap[str, str]

    def __init__(self, name: str, version: str, filename: str, expected: str):
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", name):
            raise gl.vm.UserError("Expected an unscoped npm package")
        if not re.fullmatch(r"[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}", version):
            raise gl.vm.UserError("Expected an exact three-part version")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", filename):
            raise gl.vm.UserError("Expected a root-level filename")
        if not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise gl.vm.UserError("Expected a lowercase SHA-256")
        self.expected = expected
        self.package_path = name + "@" + version + "/" + filename
        self.round = u256(0)

    @gl.public.write
    def sample(self, previous: int) -> int:
        if previous != self.round:
            raise gl.vm.UserError("Stale checkpoint")
        suffix = self.package_path

        def observe() -> str:
            digests = []
            for base in (
                "https://cdn.jsdelivr.net/npm/",
                "https://unpkg.com/",
                "https://esm.sh/",
            ):
                try:
                    response = gl.nondet.web.get(base + suffix)
                    if response.status == 200 and response.body is not None and 0 < len(response.body) <= 32768:
                        digests.append(hashlib.sha256(response.body).hexdigest())
                except Exception:
                    continue
                # A strict majority of the three configured endpoints is conclusive.
                digest = majority(digests)
                if digest:
                    return digest
            return ""

        digest = gl.eq_principle.strict_eq(observe)
        number = previous + 1
        status = "INCONCLUSIVE"
        if digest:
            status = "MATCH" if digest == self.expected else "DRIFT"
        self.reports[str(number)] = json.dumps({"digest": digest, "status": status})
        self.round = u256(number)
        return number

    @gl.public.view
    def get_checkpoint(self, number: int) -> str:
        return self.reports.get(str(number), "")

    @gl.public.view
    def get_policy(self) -> str:
        return json.dumps({"file": self.package_path, "expected": self.expected, "round": self.round})
