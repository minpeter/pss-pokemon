from pathlib import Path

from pokemon_harness.app import create_app
from pokemon_harness.fake_emulator import FakeEmulator
from pokemon_harness.save_store import SaveStore

app = create_app(emulator=FakeEmulator(), save_store=SaveStore(root=Path(".local/saves")))
