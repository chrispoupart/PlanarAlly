import json
from typing import Any, List
from typing_extensions import TypedDict

from playhouse.shortcuts import update_model_from_dict

import auth
from api.socket.constants import GAME_NS
from api.socket.shape.utils import get_owner_sids, get_shape_or_none
from app import app, sio
from models import Aura, PlayerRoom, ShapeLabel, Tracker
from models.shape import Shape
from models.utils import reduce_data_to_model
from state.game import game_state


class ShapeSetBooleanValue(TypedDict):
    shape: str
    value: bool


class ShapeSetStringValue(TypedDict):
    shape: str
    value: str


class ShapeAuraSetBooleanValue(TypedDict):
    shape: str
    aura: str
    value: bool


class TrackerData(TypedDict):
    uuid: str
    shape: str


class TrackerDelta(TrackerData, total=False):
    visible: bool
    name: str
    value: int
    maxvalue: int
    draw: bool
    primaryColor: str
    secondaryColor: str


class TrackerMove(TypedDict):
    shape: str
    tracker: str
    new_shape: str


class AuraMove(TypedDict):
    shape: str
    aura: str
    new_shape: str


class AuraData(TypedDict):
    uuid: str
    shape: str


class AuraDelta(AuraData, total=False):
    vision_source: bool
    visible: bool
    name: str
    value: int
    dim: int
    colour: str


@sio.on("Shape.Options.Invisible.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_invisible(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Invisible.Set")
    if shape is None:
        return

    shape.is_invisible = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.Invisible.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Defeated.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_defeated(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Defeated.Set")
    if shape is None:
        return

    shape.is_defeated = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.Defeated.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Locked.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_locked(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Locked.Set")
    if shape is None:
        return

    shape.is_locked = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.Locked.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Token.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_token(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Token.Set")
    if shape is None:
        return

    shape.is_token = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.Token.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.MovementBlock.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_movement_block(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "MovementBlock.Set")
    if shape is None:
        return

    shape.movement_obstruction = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.MovementBlock.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.VisionBlock.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_vision_block(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "VisionBlock.Set")
    if shape is None:
        return

    shape.vision_obstruction = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.VisionBlock.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Annotation.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_annotation(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Annotation.Set")
    if shape is None:
        return

    shape.annotation = data["value"]
    shape.save()

    if shape.annotation_visible:
        await sio.emit(
            "Shape.Options.Annotation.Set",
            data,
            skip_sid=sid,
            room=pr.active_location.get_path(),
            namespace=GAME_NS,
        )
    else:
        for sid in get_owner_sids(pr, shape, skip_sid=sid):
            await sio.emit(
                "Shape.Options.Annotation.Set",
                data,
                room=sid,
                namespace=GAME_NS,
            )


@sio.on("Shape.Options.AnnotationVisible.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_annotation_visible(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "AnnotationVisible.Set")
    if shape is None:
        return

    shape.annotation_visible = data["value"]
    shape.save()

    owners = [*get_owner_sids(pr, shape, skip_sid=sid)]

    await sio.emit(
        "Shape.Options.AnnotationVisible.Set",
        data,
        room=pr.active_location.get_path(),
        skip_sid=sid,
        namespace=GAME_NS,
    )

    for psid in game_state.get_sids(active_location=pr.active_location, skip_sid=sid):
        if psid in owners:
            continue
        await sio.emit(
            "Shape.Options.Annotation.Set",
            {"shape": shape.uuid, "value": shape.annotation if data["value"] else ""},
            room=psid,
            namespace=GAME_NS,
        )


@sio.on("Shape.Options.Tracker.Remove", namespace=GAME_NS)
@auth.login_required(app, sio)
async def remove_tracker(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Tracker.Remove")
    if shape is None:
        return

    tracker: Tracker = Tracker.get_by_id(data["value"])
    tracker.delete_instance(True)

    await sio.emit(
        "Shape.Options.Tracker.Remove",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Aura.Remove", namespace=GAME_NS)
@auth.login_required(app, sio)
async def remove_aura(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Aura.Remove")
    if shape is None:
        return

    aura = Aura.get_by_id(data["value"])
    aura.delete_instance(True)

    await sio.emit(
        "Shape.Options.Aura.Remove",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Label.Add", namespace=GAME_NS)
@auth.login_required(app, sio)
async def add_label(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Label.Add")
    if shape is None:
        return

    ShapeLabel.create(shape=shape, label=data["value"])

    await sio.emit(
        "Shape.Options.Label.Add",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Label.Remove", namespace=GAME_NS)
@auth.login_required(app, sio)
async def remove_label(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    label = ShapeLabel.get(shape=data["shape"], label=data["value"])
    label.delete_instance(True)

    await sio.emit(
        "Shape.Options.Label.Remove",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Name.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_name(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Name.Set")
    if shape is None:
        return

    shape.name = data["value"]
    shape.save()

    if shape.name_visible:
        await sio.emit(
            "Shape.Options.Name.Set",
            data,
            skip_sid=sid,
            room=pr.active_location.get_path(),
            namespace=GAME_NS,
        )
    else:
        for sid in get_owner_sids(pr, shape, skip_sid=sid):
            await sio.emit(
                "Shape.Options.Name.Set",
                data,
                room=sid,
                namespace=GAME_NS,
            )


@sio.on("Shape.Options.NameVisible.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_name_visible(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "NameVisible.Set")
    if shape is None:
        return

    shape.name_visible = data["value"]
    shape.save()

    owners = [*get_owner_sids(pr, shape, skip_sid=sid)]

    await sio.emit(
        "Shape.Options.NameVisible.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )

    for psid in game_state.get_sids(active_location=pr.active_location, skip_sid=sid):
        if psid in owners:
            continue
        await sio.emit(
            "Shape.Options.Name.Set",
            {"shape": shape.uuid, "value": shape.name if data["value"] else "?"},
            room=psid,
            namespace=GAME_NS,
        )


@sio.on("Shape.Options.ShowBadge.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_show_badge(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "ShowBadge.Set")
    if shape is None:
        return

    shape.show_badge = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.ShowBadge.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.StrokeColour.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_stroke_colour(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "StrokeColour.Set")
    if shape is None:
        return

    shape.stroke_colour = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.StrokeColour.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.FillColour.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_fill_colour(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "FillColour.Set")
    if shape is None:
        return

    shape.fill_colour = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.FillColour.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Tracker.Create", namespace=GAME_NS)
@auth.login_required(app, sio)
async def create_tracker(sid: str, data: TrackerDelta):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Tracker.Create")
    if shape is None:
        return

    model = reduce_data_to_model(Tracker, data)
    tracker = Tracker.create(**model)
    tracker.save()

    owners = [*get_owner_sids(pr, shape, skip_sid=sid)]
    for psid in owners:
        await sio.emit(
            "Shape.Options.Tracker.Create",
            data,
            room=psid,
            namespace=GAME_NS,
        )
    if tracker.visible:
        for psid in game_state.get_sids(
            active_location=pr.active_location, skip_sid=sid
        ):
            if psid in owners:
                continue
            await sio.emit(
                "Shape.Options.Tracker.Create",
                data,
                room=psid,
                namespace=GAME_NS,
            )


@sio.on("Shape.Options.Tracker.Update", namespace=GAME_NS)
@auth.login_required(app, sio)
async def update_tracker(sid: str, data: TrackerDelta):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Tracker.Update")
    if shape is None:
        return

    tracker = Tracker.get_by_id(data["uuid"])
    changed_visible = tracker.visible != data.get("visible", tracker.visible)
    update_model_from_dict(tracker, data)
    tracker.save()

    owners = [*get_owner_sids(pr, shape, skip_sid=sid)]
    for psid in owners:
        await sio.emit(
            "Shape.Options.Tracker.Update",
            data,
            room=psid,
            namespace=GAME_NS,
        )
    for psid in game_state.get_sids(active_location=pr.active_location, skip_sid=sid):
        if psid in owners:
            continue
        if changed_visible:
            if tracker.visible:
                await sio.emit(
                    "Shape.Options.Tracker.Create",
                    {"shape": shape.uuid, **tracker.as_dict()},
                    room=psid,
                    namespace=GAME_NS,
                )
            else:
                await sio.emit(
                    "Shape.Options.Tracker.Remove",
                    {"shape": shape.uuid, "value": tracker.uuid},
                    room=psid,
                    namespace=GAME_NS,
                )
        else:
            await sio.emit(
                "Shape.Options.Tracker.Update",
                data,
                room=psid,
                namespace=GAME_NS,
            )


@sio.on("Shape.Options.Tracker.Move", namespace=GAME_NS)
@auth.login_required(app, sio)
async def move_tracker(sid: str, data: TrackerMove):
    pr: PlayerRoom = game_state.get(sid)

    new_shape = get_shape_or_none(pr, data["new_shape"], "Tracker.Options.Tracker.Move")
    if new_shape is None:
        return

    tracker = Tracker.get_by_id(data["tracker"])
    tracker.shape = new_shape
    tracker.save()

    await sio.emit(
        "Shape.Options.Tracker.Move",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.Aura.Create", namespace=GAME_NS)
@auth.login_required(app, sio)
async def create_aura(sid: str, data: AuraDelta):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Aura.Create")
    if shape is None:
        return

    model = reduce_data_to_model(Aura, data)
    aura = Aura.create(**model)
    aura.save()

    owners = [*get_owner_sids(pr, shape, skip_sid=sid)]
    for psid in owners:
        await sio.emit(
            "Shape.Options.Aura.Create",
            data,
            room=psid,
            namespace=GAME_NS,
        )
    if aura.visible:
        for psid in game_state.get_sids(
            active_location=pr.active_location, skip_sid=sid
        ):
            if psid in owners:
                continue
            await sio.emit(
                "Shape.Options.Aura.Create",
                data,
                room=psid,
                namespace=GAME_NS,
            )


@sio.on("Shape.Options.Aura.Update", namespace=GAME_NS)
@auth.login_required(app, sio)
async def update_aura(sid: str, data: AuraDelta):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "Aura.Update")
    if shape is None:
        return

    aura = Aura.get_by_id(data["uuid"])
    changed_visible = aura.visible != data.get("visible", aura.visible)
    update_model_from_dict(aura, data)
    aura.save()

    owners = [*get_owner_sids(pr, shape, skip_sid=sid)]
    for psid in owners:
        await sio.emit(
            "Shape.Options.Aura.Update",
            data,
            room=psid,
            namespace=GAME_NS,
        )
    for psid in game_state.get_sids(active_location=pr.active_location, skip_sid=sid):
        if psid in owners:
            continue
        if changed_visible:
            if aura.visible:
                await sio.emit(
                    "Shape.Options.Aura.Create",
                    {"shape": shape.uuid, **aura.as_dict()},
                    room=psid,
                    namespace=GAME_NS,
                )
            else:
                await sio.emit(
                    "Shape.Options.Aura.Remove",
                    {"shape": shape.uuid, "value": aura.uuid},
                    room=psid,
                    namespace=GAME_NS,
                )
        else:
            await sio.emit(
                "Shape.Options.Aura.Update",
                data,
                room=psid,
                namespace=GAME_NS,
            )


@sio.on("Shape.Options.Aura.Move", namespace=GAME_NS)
@auth.login_required(app, sio)
async def move_aura(sid: str, data: AuraMove):
    pr: PlayerRoom = game_state.get(sid)

    new_shape = get_shape_or_none(pr, data["new_shape"], "Aura.Options.Tracker.Move")
    if new_shape is None:
        return

    aura = Aura.get_by_id(data["aura"])
    aura.shape = new_shape
    aura.save()

    await sio.emit(
        "Shape.Options.Aura.Move",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.IsDoor.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_is_door(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "IsDoor.Set")
    if shape is None:
        return

    shape.is_door = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.IsDoor.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


def set_options(shape: Shape, key: str, value):
    options = json.loads(shape.options)
    for option in options:
        if option[0] == key:
            option[1] = value
            break
    else:
        options.append([key, value])
    shape.options = json.dumps(options)
    shape.save()


@sio.on("Shape.Options.DoorPermissions.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_door_permissions(sid: str, data):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "DoorPermissions.Set")
    if shape is None:
        return

    set_options(shape, "door", data["value"])

    await sio.emit(
        "Shape.Options.DoorPermissions.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.IsTeleportZone.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_is_teleport_zone(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "IsTeleportZone.Set")
    if shape is None:
        return

    shape.is_teleport_zone = data["value"]
    shape.save()

    await sio.emit(
        "Shape.Options.IsTeleportZone.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.IsImmediateTeleportZone.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_is_immediate_teleport_zone(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "IsTeleportZone.Set")
    if shape is None:
        return

    options: List[Any] = json.loads(shape.options)
    for option in options:
        if option[0] == "teleport":
            option[1]["immediate"] = data["value"]
    shape.options = json.dumps(options)
    shape.save()

    await sio.emit(
        "Shape.Options.IsImmediateTeleportZone.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.TeleportZonePermissions.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_tp_permissions(sid: str, data):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "TeleportZonePermissions.Set")
    if shape is None:
        return

    set_options(shape, "teleport", data["value"])

    await sio.emit(
        "Shape.Options.TeleportZonePermissions.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.SkipDraw.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_skip_draw(sid: str, data: ShapeSetBooleanValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "SkipDraw.Set")
    if shape is None:
        return

    set_options(shape, "skipDraw", data["value"])

    await sio.emit(
        "Shape.Options.SkipDraw.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )


@sio.on("Shape.Options.SvgAsset.Set", namespace=GAME_NS)
@auth.login_required(app, sio)
async def set_skip_draw(sid: str, data: ShapeSetStringValue):
    pr: PlayerRoom = game_state.get(sid)

    shape = get_shape_or_none(pr, data["shape"], "SkipDraw.Set")
    if shape is None:
        return

    options: List[Any] = json.loads(shape.options)
    for i, option in enumerate(options[::-1]):
        if data["value"] is None and option[0] in [
            "svgAsset",
            "svgPaths",
            "svgWidth",
            "svgHeight",
        ]:
            options.pop(i)
        elif option[0] == "svgAsset":
            option[1] = data["value"]
    shape.options = json.dumps(options)
    shape.save()

    await sio.emit(
        "Shape.Options.SvgAsset.Set",
        data,
        skip_sid=sid,
        room=pr.active_location.get_path(),
        namespace=GAME_NS,
    )
