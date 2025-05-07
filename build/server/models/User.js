"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = exports.UserRole = void 0;
// File: User.ts
const uuid_1 = require("uuid");
const bcrypt_1 = __importDefault(require("bcrypt"));
var UserRole;
(function (UserRole) {
    UserRole["VIEWER"] = "viewer";
    UserRole["STREAMER"] = "streamer";
    UserRole["ADMIN"] = "admin";
})(UserRole || (exports.UserRole = UserRole = {}));
class User {
    constructor(data) {
        this.userId = data.userId || (0, uuid_1.v4)();
        this.username = data.username || '';
        this.email = data.email || '';
        this.passwordHash = data.passwordHash || '';
        this.streamKey = data.streamKey || (data.role === UserRole.STREAMER || data.role === UserRole.ADMIN ? this.generateStreamKey() : undefined);
        this.role = data.role || UserRole.VIEWER;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
    }
    static async create(username, email, password, role = UserRole.VIEWER) {
        const saltRounds = 10;
        const passwordHash = await bcrypt_1.default.hash(password, saltRounds);
        return new User({
            username,
            email,
            passwordHash,
            role
        });
    }
    async verifyPassword(password) {
        return await bcrypt_1.default.compare(password, this.passwordHash);
    }
    regenerateStreamKey() {
        if (this.role !== UserRole.STREAMER && this.role !== UserRole.ADMIN) {
            throw new Error('Only streamers and admins can have stream keys');
        }
        this.streamKey = this.generateStreamKey();
        this.updatedAt = new Date();
        return this.streamKey;
    }
    generateStreamKey() {
        // Generate a unique stream key using uuid
        return (0, uuid_1.v4)().replace(/-/g, '');
    }
    toJSON() {
        return {
            userId: this.userId,
            username: this.username,
            email: this.email,
            role: this.role,
            streamKey: this.streamKey,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}
exports.User = User;
