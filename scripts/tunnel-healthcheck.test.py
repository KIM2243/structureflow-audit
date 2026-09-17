import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('health', Path(__file__).with_name('tunnel-healthcheck.py'))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)

class RecoveryTests(unittest.TestCase):
    def test_recovery_threshold_and_cooldown(self):
        state = {}
        for now in [1000, 1060]:
            state, restart = health.decision(state, False, now)
            self.assertFalse(restart)
        state, restart = health.decision(state, False, 1120)
        self.assertTrue(restart)
        state, restart = health.decision(state, False, 1180)
        self.assertFalse(restart)
        state, restart = health.decision(state, False, 1720)
        self.assertTrue(restart)

    def test_healthy_resets_failure_streak(self):
        state, restart = health.decision({'failures': 2}, True, 1000)
        self.assertEqual(state['failures'], 0)
        self.assertFalse(restart)
        self.assertFalse(health.decision(state, False, 1060)[1])

unittest.main()
