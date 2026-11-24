import json
import runpy
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

class UserError(Exception):
    pass

sdk = types.ModuleType("genlayer")
sdk.TreeMap = dict
sdk.u256 = int
sdk.gl = types.SimpleNamespace(
    Contract=object, vm=types.SimpleNamespace(UserError=UserError),
    message=types.SimpleNamespace(sender_address="lab"),
    public=types.SimpleNamespace(view=lambda fn: fn, write=lambda fn: fn),
    eq_principle=types.SimpleNamespace(strict_eq=lambda fn: fn()),
    nondet=types.SimpleNamespace(web=types.SimpleNamespace()),
)
with patch.dict(sys.modules, {"genlayer": sdk}):
    contract = runpy.run_path(str(Path(__file__).resolve().parents[1] / "contracts/contract.py"))

class MirrorTests(unittest.TestCase):
    def setUp(self):
        from hashlib import sha256
        self.digest = sha256(b"good").hexdigest()
        self.monitor = contract["MirrorParity"]("demo", "1.0.0", "LICENSE", self.digest)
        self.monitor.reports = {}

    def sample(self, outcomes, previous):
        cases = iter(outcomes)
        sdk.gl.nondet.web.get = lambda url: types.SimpleNamespace(status=200, body=next(cases))
        number = self.monitor.sample(previous)
        return json.loads(self.monitor.get_checkpoint(number))["status"]

    def test_quorum_and_stale_guard(self):
        self.assertEqual(self.sample([b"other", b"good", b"good"], 0), "MATCH")
        with self.assertRaisesRegex(UserError, "Stale checkpoint"):
            self.monitor.sample(0)
        self.assertEqual(self.monitor.round, 1)

    def test_drift_and_inconclusive_are_distinct(self):
        self.assertEqual(self.sample([b"changed", b"changed"], 0), "DRIFT")
        self.assertEqual(self.sample([b"A", b"B", b"C"], 1), "INCONCLUSIVE")
        self.assertEqual(json.loads(self.monitor.get_checkpoint(1))["status"], "DRIFT")
