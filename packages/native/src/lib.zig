pub const io = @import("runtime.zig").io();
pub const std_options = @import("runtime-abi.zig").std_options;
pub const os = if (@import("builtin").cpu.arch.isWasm()) struct {
    pub const heap = struct {
        pub const page_allocator = @import("wasm-heap.zig").page_allocator;
    };
} else struct {};

comptime {
    @import("context-abi.zig").export_symbols();
    _ = @import("audio-abi.zig");
    _ = @import("clipboard-abi.zig");
    _ = @import("native-span-feed-abi.zig");
    _ = @import("runtime-abi.zig");
    _ = @import("yoga.zig");
    if (@import("builtin").cpu.arch.isWasm()) _ = @import("wasm-abi.zig");
}
