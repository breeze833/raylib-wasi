# Makefile for raylib-wasi
# Standalone Raylib 5.5 port to wasm32-wasi without Emscripten

CC = clang
AR = llvm-ar
NODE ?= node
TARGET ?= wasm32-wasi

RAYLIB_SRC = vendor/raylib/src
SRC_DIR = src
DIST_DIR = dist
DIST_INC = $(DIST_DIR)/include
DIST_LIB = $(DIST_DIR)/lib
BUILD_DIR = build

CFLAGS ?= -O2 -Wall
CFLAGS += --target=$(TARGET) \
          -DPLATFORM_CUSTOM \
          -DGRAPHICS_API_OPENGL_ES2 \
          -DWaitTime=Raylib_Internal_WaitTime \
          -I$(RAYLIB_SRC) \
          -I$(SRC_DIR)

RAYLIB_OBJS = $(BUILD_DIR)/rcore.o \
              $(BUILD_DIR)/rshapes.o \
              $(BUILD_DIR)/rtextures.o \
              $(BUILD_DIR)/rtext.o \
              $(BUILD_DIR)/rmodels.o \
              $(BUILD_DIR)/utils.o

PLATFORM_OBJS = $(BUILD_DIR)/rcore_wasi.o \
                $(BUILD_DIR)/gl_wasi.o

ALL_OBJS = $(RAYLIB_OBJS) $(PLATFORM_OBJS)

EXAMPLES = examples/core_basic_window.wasm \
           examples/shapes_basic_shapes.wasm \
           examples/core_input_keys.wasm

.PHONY: all clean headers host test examples package serve

all: $(DIST_LIB)/libraylib.a headers host

serve: all
	$(NODE) scripts/serve.js

examples: all $(EXAMPLES)

examples/%.wasm: examples/%.c $(DIST_LIB)/libraylib.a
	$(CC) --target=$(TARGET) -nodefaultlibs -lc -I$(DIST_INC) $< $(DIST_LIB)/libraylib.a -o $@

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(DIST_LIB):
	mkdir -p $(DIST_LIB)

$(DIST_INC):
	mkdir -p $(DIST_INC)

# Compile upstream unmodified files
$(BUILD_DIR)/%.o: $(RAYLIB_SRC)/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Compile platform and WebGL wrappers
$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Archive into static library
$(DIST_LIB)/libraylib.a: $(ALL_OBJS) | $(DIST_LIB)
	$(AR) rcs $@ $(ALL_OBJS)

# Copy public headers to dist/include
headers: | $(DIST_INC)
	cp $(RAYLIB_SRC)/raylib.h $(DIST_INC)/
	cp $(RAYLIB_SRC)/raymath.h $(DIST_INC)/
	cp $(RAYLIB_SRC)/rlgl.h $(DIST_INC)/

# Bundle standalone host bridge
host:
	$(NODE) scripts/bundle-host.js

test: all
	$(NODE) --test test/host.test.js
	$(NODE) --test test/symbols.test.js

package: all
	tar -czf $(DIST_DIR)/raylib-wasi.tar.gz -C $(DIST_DIR) include lib raylib-host.js raylib-host.d.ts
	cd $(DIST_DIR) && zip -q -r raylib-wasi.zip include lib raylib-host.js raylib-host.d.ts
	npm pack --pack-destination $(DIST_DIR)

clean:
	rm -rf $(BUILD_DIR) $(DIST_DIR)/lib $(DIST_DIR)/include $(DIST_DIR)/*.tar.gz $(DIST_DIR)/*.zip $(DIST_DIR)/*.tgz $(EXAMPLES)
