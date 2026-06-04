from typing import ClassVar

from pydantic import BaseModel, ConfigDict


class HarnessModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        frozen=True,
        populate_by_name=True,
        use_enum_values=True,
    )
