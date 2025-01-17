from uuid import uuid4

from peewee import BooleanField, ForeignKeyField, TextField
from playhouse.shortcuts import model_to_dict

from .base import BaseModel
from .campaign import Room
from .user import User


__all__ = ["Label", "LabelSelection"]


class Label(BaseModel):
    uuid = TextField(primary_key=True)
    user = ForeignKeyField(User, backref="labels", on_delete="CASCADE")
    category = TextField(null=True)
    name = TextField()
    visible = BooleanField()

    def as_dict(self):
        d = model_to_dict(self, recurse=False, exclude=[Label.id])
        d["user"] = self.user.name
        return d

    def make_copy(self):
        return Label.create(
            uuid=str(uuid4()),
            user=self.user,
            category=self.category,
            name=self.name,
            visible=self.visible,
        )


class LabelSelection(BaseModel):
    label = ForeignKeyField(Label, on_delete="CASCADE")
    user = ForeignKeyField(User, on_delete="CASCADE")
    room = ForeignKeyField(Room, on_delete="CASCADE")
