import { SyncTo } from "../../../core/models/types";
import { socket } from "../../api/socket";
import { getLocalId } from "../../id";
import type { GlobalId } from "../../id";

import { partialTrackerFromServer, trackersFromServer } from "./conversion";
import type { ServerTracker, Tracker, TrackerId } from "./models";

import { trackerSystem } from ".";

socket.on("Shape.Options.Tracker.Remove", (data: { shape: GlobalId; value: TrackerId }): void => {
    const shape = getLocalId(data.shape);
    if (shape === undefined) return;
    trackerSystem.remove(shape, data.value, SyncTo.UI);
});

socket.on("Shape.Options.Tracker.Create", (data: ServerTracker): void => {
    const shape = getLocalId(data.shape);
    if (shape === undefined) return;
    trackerSystem.add(shape, trackersFromServer(data)[0], SyncTo.UI);
});

socket.on("Shape.Options.Tracker.Update", (data: { uuid: TrackerId; shape: GlobalId } & Partial<Tracker>): void => {
    const shape = getLocalId(data.shape);
    if (shape === undefined) return;
    trackerSystem.update(shape, data.uuid, partialTrackerFromServer(data), SyncTo.UI);
});

socket.on("Shape.Options.Tracker.Move", (data: { shape: GlobalId; tracker: TrackerId; new_shape: GlobalId }): void => {
    const shape = getLocalId(data.shape);
    const newShape = getLocalId(data.new_shape);
    if (shape === undefined || newShape === undefined) return;
    const tracker = trackerSystem.get(shape, data.tracker, false);
    if (tracker === undefined) return;

    trackerSystem.remove(shape, data.tracker, SyncTo.UI);
    trackerSystem.add(newShape, tracker, SyncTo.UI);
});
