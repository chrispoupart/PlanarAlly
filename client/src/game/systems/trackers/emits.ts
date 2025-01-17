import { sendShapeOption, sendSimpleShapeOption } from "../../api/emits/shape/options";
import { socket } from "../../api/socket";

import type { ServerTracker, TrackerId } from "./models";

export const sendShapeRemoveTracker = sendSimpleShapeOption<TrackerId>("Shape.Options.Tracker.Remove");
export const sendShapeMoveTracker =
    sendShapeOption<{ tracker: TrackerId; new_shape: string }>("Shape.Options.Tracker.Move");

export const sendShapeCreateTracker = (data: ServerTracker): void => {
    socket.emit("Shape.Options.Tracker.Create", data);
};

export const sendShapeUpdateTracker = (data: { shape: string; uuid: TrackerId } & Partial<ServerTracker>): void => {
    socket.emit("Shape.Options.Tracker.Update", data);
};
