import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncTo } from "../../../../src/core/models/types";
import { socket } from "../../../../src/game/api/socket";
import type { LocalId } from "../../../../src/game/id";
import type { IShape } from "../../../../src/game/shapes/interfaces";
import { accessSystem } from "../../../../src/game/systems/access";
import { DEFAULT_ACCESS, DEFAULT_ACCESS_SYMBOL } from "../../../../src/game/systems/access/models";
import type { ShapeAccess } from "../../../../src/game/systems/access/models";
import { clientStore } from "../../../../src/store/client";
import { gameStore } from "../../../../src/store/game";
import { generateTestLocalId } from "../../../helpers";

const errorSpy = vi.spyOn(console, "error");
const emitSpy = vi.spyOn(socket, "emit");
const addOwnedTokenSpy = vi.spyOn(gameStore, "addOwnedToken");
const removeOwnedTokenSpy = vi.spyOn(gameStore, "removeOwnedToken");

let GET_SHAPE_OVERRIDE: (() => Partial<IShape> | undefined) | undefined = undefined;
vi.mock("../../../../src/game/id", async () => {
    const id: Record<string, any> = await vi.importActual("../../../../src/game/id");
    return {
        ...id,
        getShape: (localId: LocalId) => {
            return GET_SHAPE_OVERRIDE === undefined ? id.getShape(localId) : GET_SHAPE_OVERRIDE();
        },
    };
});

describe("Access System", () => {
    beforeEach(() => {
        accessSystem.clear();
        errorSpy.mockClear();
        emitSpy.mockClear();
        addOwnedTokenSpy.mockClear();
        removeOwnedTokenSpy.mockClear();
        GET_SHAPE_OVERRIDE = undefined;
        clientStore.setUsername("");
    });
    describe("inform", () => {
        it("should update $state if active", () => {
            // setup
            const id = generateTestLocalId();
            const id2 = generateTestLocalId();
            accessSystem.loadState(id);
            //test
            accessSystem.inform(id2, {
                default: { edit: false, movement: true, vision: true },
                extra: [{ access: { edit: true, movement: false, vision: true }, shape: id2, user: "testUser" }],
            });
            expect(accessSystem.state.defaultAccess).toEqual(DEFAULT_ACCESS);
            expect(accessSystem.state.playerAccess.size).toBe(0);

            accessSystem.inform(id, {
                default: { edit: false, movement: true, vision: true },
                extra: [{ access: { edit: true, movement: false, vision: true }, shape: id2, user: "testUser" }],
            });
            expect(accessSystem.state.defaultAccess).toEqual({ edit: false, movement: true, vision: true });
            expect(accessSystem.state.playerAccess.get("testUser")).toEqual({
                edit: true,
                movement: false,
                vision: true,
            });
        });
    });
    describe("getDefault", () => {
        it("should return DEFAULT_ACCESS when configured as such", () => {
            // setup
            const id = generateTestLocalId();
            const id2 = generateTestLocalId();
            accessSystem.inform(id, { default: DEFAULT_ACCESS, extra: [] });
            accessSystem.inform(id2, {
                default: DEFAULT_ACCESS,
                extra: [{ access: { edit: true, movement: false, vision: true }, shape: id2, user: "testUser" }],
            });
            // test
            expect(accessSystem.getDefault(id)).toBe(DEFAULT_ACCESS);
            expect(accessSystem.getDefault(id2)).toBe(DEFAULT_ACCESS);
        });
        it("should return the correct default access when configured", () => {
            // setup
            const id = generateTestLocalId();
            const id2 = generateTestLocalId();
            const id1Default = { edit: true, movement: false, vision: true };
            const id2Default = { edit: false, movement: true, vision: false };

            accessSystem.inform(id, { default: id1Default, extra: [] });
            accessSystem.inform(id2, {
                default: id2Default,
                extra: [{ access: { edit: true, movement: false, vision: true }, shape: id2, user: "testUser" }],
            });
            // test
            expect(accessSystem.getDefault(id)).toBe(id1Default);
            expect(accessSystem.getDefault(id2)).toBe(id2Default);
        });
    });
    describe("hasAccessTo", () => {
        let id: LocalId;
        let id2: LocalId;

        beforeEach(() => {
            id = generateTestLocalId();
            id2 = generateTestLocalId();
            const id1Default = { edit: true, movement: false, vision: true };
            const id2Default = { edit: false, movement: true, vision: false };
            const id2TestUser = {
                access: { edit: true, movement: true, vision: true },
                shape: id2,
                user: "userWithFullRights",
            };
            const id2DmUser = {
                access: { edit: false, movement: false, vision: false },
                shape: id2,
                user: "userWithNoRights",
            };

            accessSystem.inform(id, { default: id1Default, extra: [] });
            accessSystem.inform(id2, {
                default: id2Default,
                extra: [id2TestUser, id2DmUser],
            });
        });
        it("should always return true if the player is a DM", () => {
            // setup
            gameStore.setDm(true);
            // test
            expect(accessSystem.hasAccessTo(id, false, { edit: true })).toBe(true);
            // extra checks
            // 1. shape does not exist
            GET_SHAPE_OVERRIDE = () => undefined;
            expect(accessSystem.hasAccessTo(id, false, { edit: true })).toBe(true);
            // 2. shape is a token that is not active and the limiter is active
            GET_SHAPE_OVERRIDE = () => ({ isToken: true });
            gameStore.setActiveTokens();
            expect(accessSystem.hasAccessTo(id, true, { edit: true })).toBe(true);
            GET_SHAPE_OVERRIDE = undefined;
            // 3. the current user would otherwise not have access
            clientStore.setUsername("userWithNoRights");
            expect(accessSystem.hasAccessTo(id2, false, { edit: true })).toBe(true);
            // teardown
            gameStore.setDm(false);
        });
        it("should return false if the shape does not exist", () => {
            // setup
            GET_SHAPE_OVERRIDE = () => undefined;
            // test
            expect(accessSystem.hasAccessTo(id, false, { movement: true })).toBe(false);
            // extra checks
            // 1. fake player
            gameStore.setFakePlayer(true);
            expect(accessSystem.hasAccessTo(id, false, { movement: true })).toBe(false);
            gameStore.setFakePlayer(false);
            gameStore.setDm(false); // fakeplayer resets isDm
            // 2. default access is granted
            expect(accessSystem.hasAccessTo(id, false, { edit: true })).toBe(false);
            // 3. user access is granted
            clientStore.setUsername("userWithFullRights");
            expect(accessSystem.hasAccessTo(id2, false, { edit: true })).toBe(false);
        });
        it("should return false if the shape is a token and NOT an active token with the limiter active", () => {
            // setup
            GET_SHAPE_OVERRIDE = () => ({ isToken: true });
            gameStore.setActiveTokens();
            // test
            expect(accessSystem.hasAccessTo(id, true, { edit: true })).toBe(false);
            // without limiter
            expect(accessSystem.hasAccessTo(id, false, { edit: true })).toBe(true);
            // without isToken
            GET_SHAPE_OVERRIDE = undefined;
            expect(accessSystem.hasAccessTo(id, true, { edit: true })).toBe(true);
            // with active token
            GET_SHAPE_OVERRIDE = () => ({ isToken: true });
            gameStore.setActiveTokens(id);
            expect(accessSystem.hasAccessTo(id, true, { edit: true })).toBe(true);
            gameStore.setActiveTokens();
            // extra checks
            // 1. fake player
            gameStore.setFakePlayer(true);
            expect(accessSystem.hasAccessTo(id, true, { edit: true })).toBe(false);
            gameStore.setFakePlayer(false);
            gameStore.setDm(false); // fakeplayer resets isDm
            // 2. default access is granted
            expect(accessSystem.hasAccessTo(id, true, { edit: true })).toBe(false);
            // 3. user access is granted
            clientStore.setUsername("userWithFullRights");
            expect(accessSystem.hasAccessTo(id2, true, { edit: true })).toBe(false);
        });
        it("should return true if fake player is activated", () => {
            // setup
            gameStore.setFakePlayer(true);
            // test
            expect(accessSystem.hasAccessTo(id, false, { movement: true })).toBe(true);
            // extra checks
            // 1. user access is not granted
            clientStore.setUsername("userWithNoRights");
            expect(accessSystem.hasAccessTo(id2, false, { edit: true })).toBe(true);
            // teardown
            gameStore.setFakePlayer(false);
            gameStore.setDm(false); // fakeplayer resets isDm
        });
        it("should return true if default access is granted", () => {
            // test
            expect(accessSystem.hasAccessTo(id, false, { edit: true })).toBe(true);
            expect(accessSystem.hasAccessTo(id2, false, { movement: true })).toBe(true);
            expect(accessSystem.hasAccessTo(id, false, { vision: true })).toBe(true);
            // extra checks
            // 1. user access is not granted
            clientStore.setUsername("userWithNoRights");
            expect(accessSystem.hasAccessTo(id2, false, { movement: true })).toBe(true);
        });
        it("should return true if user access is granted", () => {
            // setup
            clientStore.setUsername("userWithFullRights");
            // test
            expect(accessSystem.hasAccessTo(id2, false, { edit: true })).toBe(true);
            expect(accessSystem.hasAccessTo(id2, false, { vision: true })).toBe(true);
        });
        it("should return fakse if user access is not granted", () => {
            // setup
            clientStore.setUsername("userWithNoRights");
            // test
            expect(accessSystem.hasAccessTo(id, false, { movement: true })).toBe(false);
            expect(accessSystem.hasAccessTo(id2, false, { edit: true })).toBe(false);
            expect(accessSystem.hasAccessTo(id2, false, { vision: true })).toBe(false);
        });
    });
    describe("getAccess", () => {
        it("should return undefined if access was not configured for the shape.", () => {
            const id = generateTestLocalId();
            expect(accessSystem.getAccess(id, "some user")).toBeUndefined();
        });
        it("should return undefined if access was not given for a specific user.", () => {
            const id = generateTestLocalId();
            accessSystem.inform(id, { default: DEFAULT_ACCESS, extra: [] });
            expect(accessSystem.getAccess(id, "some user")).toBeUndefined();
        });
        it("should return the access for a specific user if it was added", () => {
            const id = generateTestLocalId();
            const access: ShapeAccess = { vision: true, movement: false, edit: true };
            accessSystem.inform(id, { default: DEFAULT_ACCESS, extra: [{ user: "some user", shape: id, access }] });
            expect(accessSystem.getAccess(id, "some user")).toBe(access);
        });
    });
    describe("addAccess", () => {
        it("should error out if the user already has access", () => {
            // setup
            const id = generateTestLocalId();
            const access: ShapeAccess = { edit: false, movement: false, vision: true };
            accessSystem.inform(id, { default: DEFAULT_ACCESS, extra: [{ user: "some user", shape: id, access }] });
            // test
            accessSystem.addAccess(id, "some user", access, SyncTo.SERVER);
            expect(errorSpy).toBeCalled();
            expect(emitSpy).not.toBeCalled();
            expect(addOwnedTokenSpy).not.toBeCalled();
        });
        it("should add a new user to the system", () => {
            // setup
            const id = generateTestLocalId();
            const someUserAccess: ShapeAccess = { edit: false, movement: false, vision: true };
            const newUserAccess: ShapeAccess = { edit: false, movement: true, vision: true };
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: someUserAccess }],
            });
            // test
            accessSystem.addAccess(id, "new user", newUserAccess, SyncTo.SERVER);
            expect(errorSpy).not.toBeCalled();
            expect(emitSpy).toBeCalled();
            expect(addOwnedTokenSpy).not.toBeCalled();
            expect(accessSystem.getAccess(id, "new user")).toEqual(newUserAccess);
            // verify other users not changed
            expect(accessSystem.getDefault(id)).toBe(DEFAULT_ACCESS);
            expect(accessSystem.getAccess(id, "some user")).toBe(someUserAccess);
        });
        it("should not emit if SyncTo is not server", () => {
            // setup
            const id = generateTestLocalId();
            const someUserAccess: ShapeAccess = { edit: false, movement: false, vision: true };
            const newUserAccess: ShapeAccess = { edit: false, movement: true, vision: true };
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [],
            });
            // test
            accessSystem.addAccess(id, "some user", someUserAccess, SyncTo.UI);
            accessSystem.addAccess(id, "new user", newUserAccess, SyncTo.SHAPE);
            expect(errorSpy).not.toBeCalled();
            expect(emitSpy).not.toBeCalled();
            expect(addOwnedTokenSpy).not.toBeCalled();
        });
        it("should update $state", () => {
            // setup
            const id = generateTestLocalId();
            const id2 = generateTestLocalId();
            const someUserAccess: ShapeAccess = { edit: false, movement: false, vision: true };
            const newUserAccess: ShapeAccess = { edit: false, movement: true, vision: true };
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [],
            });
            accessSystem.inform(id2, {
                default: DEFAULT_ACCESS,
                extra: [],
            });
            accessSystem.loadState(id);
            // test
            accessSystem.addAccess(id, "some user", someUserAccess, SyncTo.UI);
            accessSystem.addAccess(id2, "new user", newUserAccess, SyncTo.SHAPE);
            expect(accessSystem.state.playerAccess.get("some user")).toEqual(someUserAccess);
            expect(accessSystem.state.playerAccess.get("new user")).toBeUndefined();
        });
        it("should call addOwnedToken if access is vision AND username matches AND isToken", () => {
            // setup
            const id = generateTestLocalId();
            const userWithoutVision: ShapeAccess = { edit: false, movement: false, vision: false };
            const userWithVision: ShapeAccess = { edit: false, movement: false, vision: true };
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [],
            });
            // test
            // 1. vision: false && username is ok && !isToken
            clientStore.setUsername("some user");
            accessSystem.addAccess(id, "some user", userWithoutVision, SyncTo.UI);
            expect(addOwnedTokenSpy).not.toBeCalled();
            // 2. vision: true && username is ok && !isToken
            clientStore.setUsername("vision user wo isToken");
            accessSystem.addAccess(id, "vision user wo isToken", userWithVision, SyncTo.UI);
            expect(addOwnedTokenSpy).not.toBeCalled();
            // 3. vision: true && username is ok && isToken
            GET_SHAPE_OVERRIDE = () => ({ isToken: true });
            clientStore.setUsername("vision user w isToken");
            accessSystem.addAccess(id, "vision user w isToken", userWithVision, SyncTo.UI);
            expect(addOwnedTokenSpy).toBeCalled();
        });
    });
    describe("updateAccess", () => {
        it("should error if the shape is not known to the system", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.updateAccess(id, "some user", { edit: true }, SyncTo.SERVER);
            // test
            expect(errorSpy).toBeCalled();
        });
        it("should error if the user has no access to the shape", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, { default: DEFAULT_ACCESS, extra: [] });
            accessSystem.updateAccess(id, "some user", { edit: true }, SyncTo.SERVER);
            // test
            expect(errorSpy).toBeCalled();
        });
        it("should update default state", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, { default: DEFAULT_ACCESS, extra: [] });
            // test
            expect(accessSystem.getDefault(id)).toEqual({ edit: false, movement: false, vision: false });
            accessSystem.updateAccess(id, DEFAULT_ACCESS_SYMBOL, { edit: true }, SyncTo.SERVER);
            expect(accessSystem.getDefault(id)).toEqual({ edit: true, movement: false, vision: false });
            expect(errorSpy).not.toBeCalled();
            expect(emitSpy).toBeCalled();
        });
        it("should update user state", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: false } }],
            });
            // test
            expect(accessSystem.getAccess(id, "some user")).toEqual({ edit: false, movement: false, vision: false });
            accessSystem.updateAccess(id, "some user", { edit: true }, SyncTo.SERVER);
            expect(accessSystem.getAccess(id, "some user")).toEqual({ edit: true, movement: false, vision: false });
            expect(errorSpy).not.toBeCalled();
            expect(emitSpy).toBeCalled();
        });
        it("should add to the owned tokens if vision is toggled on for the current user", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: false } }],
            });
            // test
            // 1. without correct username
            accessSystem.updateAccess(id, "some user", { vision: true }, SyncTo.SERVER);
            expect(addOwnedTokenSpy).not.toBeCalled();
            accessSystem.updateAccess(id, "some user", { vision: false }, SyncTo.SERVER); // reset
            // 2. without isToken
            clientStore.setUsername("some user");
            accessSystem.updateAccess(id, "some user", { vision: true }, SyncTo.SERVER);
            expect(addOwnedTokenSpy).not.toBeCalled();
            accessSystem.updateAccess(id, "some user", { vision: false }, SyncTo.SERVER); // reset
            // 3. correct
            GET_SHAPE_OVERRIDE = () => ({
                isToken: true,
            });
            accessSystem.updateAccess(id, "some user", { vision: true }, SyncTo.SERVER);
            expect(addOwnedTokenSpy).toBeCalled();
        });
        it("should remove from the owned tokens if vision is toggled off for the current user", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: true } }],
            });
            // test
            // 1. without correct username
            accessSystem.updateAccess(id, "some user", { vision: false }, SyncTo.SERVER);
            expect(removeOwnedTokenSpy).not.toBeCalled();
            accessSystem.updateAccess(id, "some user", { vision: true }, SyncTo.SERVER); // reset
            // 2. without isToken
            clientStore.setUsername("some user");
            accessSystem.updateAccess(id, "some user", { vision: false }, SyncTo.SERVER);
            expect(removeOwnedTokenSpy).not.toBeCalled();
            accessSystem.updateAccess(id, "some user", { vision: true }, SyncTo.SERVER); // reset
            // 3. correct
            GET_SHAPE_OVERRIDE = () => ({
                isToken: true,
            });
            accessSystem.updateAccess(id, "some user", { vision: false }, SyncTo.SERVER);
            expect(removeOwnedTokenSpy).toBeCalled();
        });
        it("should update $state", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: true } }],
            });
            accessSystem.loadState(id);
            // test
            expect(accessSystem.state.playerAccess.get("some user")).toEqual({
                edit: false,
                movement: false,
                vision: true,
            });
            accessSystem.updateAccess(id, "some user", { edit: true }, SyncTo.SERVER);
            expect(accessSystem.state.playerAccess.get("some user")).toEqual({
                edit: true,
                movement: false,
                vision: true,
            });
        });
    });
    describe("removeAccess", () => {
        it("should error if the shape is not known to the system", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.removeAccess(id, "some user", SyncTo.SERVER);
            // test
            expect(errorSpy).toBeCalled();
        });
        it("should error if the user has no access to the shape", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, { default: DEFAULT_ACCESS, extra: [] });
            accessSystem.removeAccess(id, "some user", SyncTo.SERVER);
            // test
            expect(errorSpy).toBeCalled();
        });
        it("should remove the user state", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: false } }],
            });
            // test
            expect(accessSystem.getAccess(id, "some user")).toEqual({ edit: false, movement: false, vision: false });
            accessSystem.removeAccess(id, "some user", SyncTo.SERVER);
            expect(accessSystem.getAccess(id, "some user")).toBeUndefined();
            expect(errorSpy).not.toBeCalled();
            expect(emitSpy).toBeCalled();
        });
        it("should remove from the owned tokens if vision is on for the current user", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: true } }],
            });
            // test
            // 1. without correct username
            accessSystem.removeAccess(id, "some user", SyncTo.SERVER);
            expect(removeOwnedTokenSpy).not.toBeCalled();
            accessSystem.addAccess(id, "some user", { vision: true }, SyncTo.SERVER); // reset
            // 2. without isToken
            clientStore.setUsername("some user");
            accessSystem.removeAccess(id, "some user", SyncTo.SERVER);
            expect(removeOwnedTokenSpy).not.toBeCalled();
            accessSystem.addAccess(id, "some user", { vision: true }, SyncTo.SERVER); // reset
            // 3. correct
            GET_SHAPE_OVERRIDE = () => ({
                isToken: true,
            });
            accessSystem.removeAccess(id, "some user", SyncTo.SERVER);
            expect(removeOwnedTokenSpy).toBeCalled();
        });
        it("should update $state", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: true } }],
            });
            accessSystem.loadState(id);
            // test
            expect(accessSystem.state.playerAccess.has("some user")).toBe(true);
            accessSystem.removeAccess(id, "some user", SyncTo.SERVER);
            expect(accessSystem.state.playerAccess.has("some user")).toBe(false);
        });
    });
    describe("getOwners", () => {
        it("should return an empty list if the shape is not known to the system", () => {
            // setup
            const id = generateTestLocalId();
            // test
            expect(accessSystem.getOwners(id).length).toBe(0);
        });
        it("should return an empty list if no owners are associated with the shape", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [],
            });
            // test
            expect(accessSystem.getOwners(id).length).toBe(0);
        });
        it("should return all owners associated with the shape", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: true } }],
            });
            // test
            expect(accessSystem.getOwners(id)).toEqual(["some user"]);
            accessSystem.addAccess(id, "other user", DEFAULT_ACCESS, SyncTo.UI);
            expect(accessSystem.getOwners(id)).toEqual(["some user", "other user"]);
        });
    });
    describe("getOwnersFull", () => {
        it("should return an empty list if the shape is not known to the system", () => {
            // setup
            const id = generateTestLocalId();
            // test
            expect(accessSystem.getOwnersFull(id).length).toBe(0);
        });
        it("should return an empty list if no owners are associated with the shape", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [],
            });
            // test
            expect(accessSystem.getOwnersFull(id).length).toBe(0);
        });
        it("should return all owners associated with the shape", () => {
            // setup
            const id = generateTestLocalId();
            accessSystem.inform(id, {
                default: DEFAULT_ACCESS,
                extra: [{ user: "some user", shape: id, access: { edit: false, movement: false, vision: true } }],
            });
            // test
            expect(accessSystem.getOwnersFull(id)).toEqual([
                { user: "some user", shape: id, access: { edit: false, movement: false, vision: true } },
            ]);
            accessSystem.addAccess(id, "other user", DEFAULT_ACCESS, SyncTo.UI);
            expect(accessSystem.getOwnersFull(id)).toEqual([
                { user: "some user", shape: id, access: { edit: false, movement: false, vision: true } },
                { user: "other user", shape: id, access: { edit: false, movement: false, vision: false } },
            ]);
        });
    });
});
