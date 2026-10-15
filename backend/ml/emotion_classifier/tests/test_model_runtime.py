import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import model_runtime


class ModelRuntimeTests(unittest.TestCase):
    def test_explicit_v3_rollback_loads_preserved_artifact(self):
        runtime = model_runtime.load_runtime(model_runtime.V3_VERSION)
        self.assertTrue(runtime.ready, runtime.error)
        self.assertEqual(runtime.model_version, model_runtime.V3_VERSION)
        self.assertEqual(set(runtime.classes_), set(model_runtime.PROJECT_CLASSES))

    def test_unknown_version_fails_closed(self):
        runtime = model_runtime.load_runtime('unknown_model')
        self.assertFalse(runtime.ready)
        self.assertIn('Unsupported EMOTION_MODEL_VERSION', runtime.error)

    def test_v4_checksum_mismatch_fails_closed(self):
        with patch.object(model_runtime, '_sha256', return_value='invalid'):
            runtime = model_runtime.load_runtime(model_runtime.V4_VERSION)
        self.assertFalse(runtime.ready)
        self.assertIn('checksum mismatch', runtime.error)


if __name__ == '__main__':
    unittest.main()
