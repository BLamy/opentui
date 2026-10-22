const std = @import("std");

// Scratch memory for the browser FFI backend, which copies JS views into linear memory per call.
const allocator = std.heap.c_allocator;

export fn ot_wasm_alloc(len: u32) ?[*]u8 {
    const bytes = allocator.alignedAlloc(u8, .@"16", len) catch return null;
    return bytes.ptr;
}

export fn ot_wasm_free(ptr: [*]u8, len: u32) void {
    allocator.free(@as([]align(16) u8, @alignCast(ptr[0..len])));
}

// wasm-ld creates a fixed-size function table, so JS cannot grow it to install
// callbacks. Distinct placeholder functions reserve table slots that the FFI
// backend overwrites with JS trampolines.
const CALLBACK_SLOT_COUNT = 64;
var callback_slot_marker: u32 = 0;

fn callbackSlot(comptime index: u32) *const fn () callconv(.c) void {
    return &struct {
        fn slot() callconv(.c) void {
            @as(*volatile u32, &callback_slot_marker).* = index;
        }
    }.slot;
}

const callback_slots = blk: {
    var slots: [CALLBACK_SLOT_COUNT]*const fn () callconv(.c) void = undefined;
    for (&slots, 0..) |*slot, index| slot.* = callbackSlot(index);
    break :blk slots;
};

export fn ot_wasm_callback_slots(out: [*]u32, capacity: u32) u32 {
    const count = @min(capacity, CALLBACK_SLOT_COUNT);
    for (callback_slots[0..count], 0..) |slot, index| out[index] = @intCast(@intFromPtr(slot));
    return count;
}
