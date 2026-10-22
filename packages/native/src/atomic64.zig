const std = @import("std");
const builtin = @import("builtin");

// wasm32 cannot perform 64-bit atomics, but its builds are single-threaded.
const plain = builtin.single_threaded and builtin.cpu.arch.isWasm();

pub fn fetchAdd(ptr: *u64, value: u64) u64 {
    if (plain) {
        const previous = ptr.*;
        ptr.* +%= value;
        return previous;
    }
    return @atomicRmw(u64, ptr, .Add, value, .monotonic);
}

pub fn load(ptr: *const u64) u64 {
    if (plain) return ptr.*;
    return @atomicLoad(u64, ptr, .monotonic);
}

pub const Value = if (plain) struct {
    raw: u64,

    pub fn init(value: u64) @This() {
        return .{ .raw = value };
    }

    pub fn fetchAdd(self: *@This(), value: u64, comptime _: std.builtin.AtomicOrder) u64 {
        const previous = self.raw;
        self.raw +%= value;
        return previous;
    }

    pub fn load(self: *const @This(), comptime _: std.builtin.AtomicOrder) u64 {
        return self.raw;
    }

    pub fn cmpxchgWeak(self: *@This(), expected: u64, new: u64, comptime _: std.builtin.AtomicOrder, comptime _: std.builtin.AtomicOrder) ?u64 {
        if (self.raw != expected) return self.raw;
        self.raw = new;
        return null;
    }
} else std.atomic.Value(u64);
