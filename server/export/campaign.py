import json
import os
from pathlib import Path
from playhouse.shortcuts import model_to_dict

from models.campaign import (
    Floor,
    Layer,
    Location,
    LocationOptions,
    Note,
    PlayerRoom,
    Room,
)
from models.shape import (
    AssetRect,
    Aura,
    Circle,
    CircularToken,
    Label,
    Line,
    Polygon,
    Rect,
    Shape,
    ShapeLabel,
    ShapeOwner,
    Text,
    ToggleComposite,
    Tracker,
)
from models.user import User, UserOptions


def export_campaign(room: Room):
    export_data = {}
    # Room meta info
    room_data = model_to_dict(room, recurse=False)
    del room_data["id"]
    default_options = model_to_dict(room.default_options, recurse=False)
    del default_options["id"]
    export_data["room"] = {"_": room_data, "default_options": default_options}

    # Players meta info
    player_data = []
    user_data = {"_": [], "labels": []}
    for pr in room.players:
        _p = {}
        player = model_to_dict(pr, recurse=False)
        del player["id"]
        del player["room"]
        del player["last_played"]
        _p["_"] = player

        _p["user_options"] = model_to_dict(pr.user_options, recurse=False)
        del _p["user_options"]["id"]

        player_data.append(_p)

        _u = {}
        _u["_"] = model_to_dict(pr.player, recurse=False)
        del _u["_"]["password_hash"]
        default_options = model_to_dict(pr.player.default_options, recurse=False)
        del default_options["id"]
        _u["default_options"] = default_options

        user_data["_"].append(_u)
    export_data["players"] = player_data
    export_data["users"] = user_data

    notes = []
    for note in room.notes:
        n = model_to_dict(note, recurse=False)
        del n["room"]
        notes.append(n)
    export_data["room"]["notes"] = notes

    # Locations meta info
    locations_data = []
    for location in room.locations:
        location_data = {}

        _l = model_to_dict(location, recurse=False)
        del _l["room"]
        location_data["_"] = _l

        location_options = model_to_dict(location.options, recurse=False)
        del location_options["id"]
        location_data["location_options"] = location_options

        floors = []
        for floor in location.floors:
            floor_data = {}
            _f = model_to_dict(floor, recurse=False)
            del _f["location"]
            floor_data["_"] = _f

            layers = []
            for layer in floor.layers:
                layer_data = {}
                _ly = model_to_dict(layer, recurse=False)
                del _ly["floor"]
                layer_data["_"] = _ly

                shapes = []
                for shape in layer.shapes:
                    shape_data = {}
                    shape_data["_"] = model_to_dict(shape, recurse=False)
                    shape_data["st"] = model_to_dict(shape.subtype, recurse=False)

                    owners = []
                    for o in shape.owners:
                        owner = model_to_dict(o, recurse=False)
                        del owner["id"]
                        owners.append(owner)

                    shape_data["trackers"] = [
                        model_to_dict(t, recurse=False) for t in shape.trackers
                    ]
                    shape_data["auras"] = [
                        model_to_dict(a, recurse=False) for a in shape.auras
                    ]

                    labels = []
                    for l in shape.labels:
                        if not any(
                            la["uuid"] == l.label.uuid for la in user_data["labels"]
                        ):
                            user_data["labels"].append(
                                model_to_dict(l.label, recurse=False)
                            )
                        label = model_to_dict(l, recurse=False)
                        del label["id"]
                        labels.append(label)
                    shape_data["labels"] = labels

                    shape_data["access"] = owners
                    shapes.append(shape_data)
                layer_data["shapes"] = shapes

                layers.append(layer_data)
            floor_data["layers"] = layers

            floors.append(floor_data)
        location_data["floors"] = floors

        locations_data.append(location_data)
    export_data["locations"] = locations_data

    static_folder = Path("static")
    os.makedirs(static_folder / "temp", exist_ok=True)
    filename = f"{room.name}-{room.creator.name}.json"
    fullpath = static_folder / "temp" / filename
    if os.path.exists(fullpath):
        os.remove(fullpath)
    with open(fullpath, "w") as fl:
        json.dump(export_data, fl)
    return fullpath, filename


def import_campaign(fp: str):
    with open(fp, "r") as f:
        import_data = json.load(f)

    USER_MAPPING = {}  # old_id -> new_id

    # Load User data
    for user_data in import_data["users"]["_"]:
        default_options = UserOptions(**user_data["default_options"])
        default_options.save()

        user = user_data["_"]
        og_id = user["id"]
        del user["id"]

        user["default_options"] = default_options
        u = User(**user)
        u.set_password("test")
        u.save()

        USER_MAPPING[og_id] = u.id

    for label in import_data["users"]["labels"]:
        lb = Label(**label)
        lb.user_id = USER_MAPPING[label["user"]]
        lb.save(force_insert=True)

    # Load base room data
    default_options = LocationOptions(**import_data["room"]["default_options"])
    default_options.save()

    room_data = import_data["room"]["_"]
    room_data["default_options"] = default_options
    room_data["creator"] = USER_MAPPING[room_data["creator"]]
    r = Room(**room_data)
    r.save()

    ROOM_ID = r.id

    # Load locations

    LOCATION_MAPPING = {}

    for location in import_data["locations"]:
        og_id = location["_"]["id"]
        del location["_"]["id"]
        location["_"]["room"] = ROOM_ID

        location_options = LocationOptions(**location["location_options"])
        location_options.save()
        location["_"]["options"] = location_options

        l = Location(**location["_"])
        l.save()

        LOCATION_MAPPING[og_id] = l.id

        for floor in location["floors"]:
            # og_id = floor["_"]["id"]
            del floor["_"]["id"]
            floor["_"]["location"] = l.id

            f = Floor(**floor["_"])
            f.save()

            for layer in floor["layers"]:
                # og_id =
                del layer["_"]["id"]
                layer["_"]["floor"] = f.id

                ly = Layer(**layer["_"])
                ly.save()

                for shape in layer["shapes"]:

                    # general shape

                    shape["_"]["layer"] = ly
                    shape["_"]["asset"] = None
                    shape["_"]["group"] = None
                    s = Shape(**shape["_"])
                    s.save(force_insert=True)

                    # access

                    for access in shape["access"]:
                        if access["user"] not in USER_MAPPING:
                            continue

                        sa = ShapeOwner(**access)
                        sa.user_id = USER_MAPPING[access["user"]]
                        sa.save(force_insert=True)

                    # auras

                    for tracker in shape["trackers"]:
                        tr = Tracker(**tracker)
                        tr.save(force_insert=True)

                    for auras in shape["auras"]:
                        au = Aura(**auras)
                        au.save(force_insert=True)

                    # labels

                    for label in shape["labels"]:
                        lb = ShapeLabel(**label)
                        lb.save(force_insert=True)

                    # subtype

                    if s.type_ == "assetrect":
                        st = AssetRect(**shape["st"])
                        st.save(force_insert=True)
                    elif s.type_ == "circulartoken":
                        st = CircularToken(**shape["st"])
                        st.save(force_insert=True)
                    elif s.type_ == "circle":
                        st = Circle(**shape["st"])
                        st.save(force_insert=True)
                    elif s.type_ == "line":
                        st = Line(**shape["st"])
                        st.save(force_insert=True)
                    elif s.type_ == "polygon":
                        st = Polygon(**shape["st"])
                        st.save(force_insert=True)
                    elif s.type_ == "rect":
                        st = Rect(**shape["st"])
                        st.save(force_insert=True)
                    elif s.type_ == "text":
                        st = Text(**shape["st"])
                        st.save(force_insert=True)
                    elif s.type_ == "togglecomposite":
                        st = ToggleComposite(**shape["st"])
                        st.save(force_insert=True)

    # Load notes

    for note in import_data["room"]["notes"]:
        nt = Note(**note)
        nt.location_id = LOCATION_MAPPING[note["location"]]
        nt.user_id = USER_MAPPING[note["user"]]
        nt.room_id = ROOM_ID
        nt.save(force_insert=True)

    # Load PlayerRoom data

    for player in import_data["players"]:
        user_options = UserOptions(**player["user_options"])
        user_options.save()

        player["_"]["user_options"] = user_options
        player["_"]["room"] = ROOM_ID
        player["_"]["player"] = USER_MAPPING[player["_"]["player"]]
        player["_"]["active_location"] = LOCATION_MAPPING[
            player["_"]["active_location"]
        ]
        pr = PlayerRoom(**player["_"])
        pr.save()
