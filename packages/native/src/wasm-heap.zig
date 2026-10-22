const std = @import("std");
const Alignment = std.mem.Alignment;
const Allocator = std.mem.Allocator;

// std.heap.page_allocator on wasm recycles freed memory without clearing it.
// Ghostty pages and DebugAllocator buckets assume fresh pages are zeroed, as
// mmap guarantees, so the wasm build overrides page_allocator with this wrapper.
const backing = std.heap.wasm_allocator;

pub const page_allocator: Allocator = .{
    .ptr = undefined,
    .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free },
};

fn alloc(_: *anyopaque, len: usize, alignment: Alignment, ret_addr: usize) ?[*]u8 {
    const ptr = backing.rawAlloc(len, alignment, ret_addr) orelse return null;
    @memset(ptr[0..len], 0);
    return ptr;
}

fn resize(_: *anyopaque, memory: []u8, alignment: Alignment, new_len: usize, ret_addr: usize) bool {
    if (!backing.rawResize(memory, alignment, new_len, ret_addr)) return false;
    if (new_len > memory.len) @memset(memory.ptr[memory.len..new_len], 0);
    return true;
}

fn remap(_: *anyopaque, memory: []u8, alignment: Alignment, new_len: usize, ret_addr: usize) ?[*]u8 {
    const ptr = backing.rawRemap(memory, alignment, new_len, ret_addr) orelse return null;
    if (new_len > memory.len) @memset(ptr[memory.len..new_len], 0);
    return ptr;
}

fn free(_: *anyopaque, memory: []u8, alignment: Alignment, ret_addr: usize) void {
    backing.rawFree(memory, alignment, ret_addr);
}
