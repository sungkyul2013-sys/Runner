cmake_minimum_required(VERSION 3.24)
project(SoftBodyCore VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(SBC_BUILD_TESTS "Build the Catch2 test suite" ON)
option(SBC_BUILD_CLI "Build the sbc-cli headless tool" ON)
option(SBC_NATIVE_ARCH "Tune native builds for the host CPU (-march=native)" OFF)

# Determinism (ARCHITECTURE A§4.5): no FP contraction/reassociation, IEEE denormals kept.
set(SBC_FP_FLAGS -ffp-contract=off -fno-fast-math)

set(SBC_IS_WASM OFF)
if(EMSCRIPTEN)
  set(SBC_IS_WASM ON)
  # Every object (including Catch2) must share the threaded memory model; native wasm exception handling keeps
  # buildBody()'s validation errors catchable (Emscripten disables C++ exceptions by default).
  add_compile_options(-pthread -fwasm-exceptions)
  add_link_options(-pthread -fwasm-exceptions)
endif()

add_library(sbc STATIC
  src/det_math.cpp
  src/body.cpp
  src/beams.cpp
  src/constraints.cpp
  src/contact.cpp
  src/world.cpp
  src/builder.cpp
  src/stability.cpp
  src/job_system.cpp
  src/scenes.cpp
  src/vehicle.cpp
  src/proto_car.cpp
)
target_include_directories(sbc PUBLIC include)
target_compile_options(sbc PRIVATE ${SBC_FP_FLAGS} -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
target_compile_options(sbc INTERFACE ${SBC_FP_FLAGS})

find_package(Threads REQUIRED)
if(SBC_IS_WASM)
  target_compile_options(sbc PUBLIC -pthread -msimd128)
  target_link_options(sbc PUBLIC -pthread)
else()
  target_link_libraries(sbc PUBLIC Threads::Threads)
  if(SBC_NATIVE_ARCH)
    target_compile_options(sbc PUBLIC -march=native)
  endif()
endif()

# ---- WASM module for the web client -------------------------------------------------
if(SBC_IS_WASM)
  add_executable(sbc_wasm bindings/wasm/capi.cpp)
  target_link_libraries(sbc_wasm PRIVATE sbc)
  target_compile_options(sbc_wasm PRIVATE ${SBC_FP_FLAGS})
  set_target_properties(sbc_wasm PROPERTIES OUTPUT_NAME "sbc" SUFFIX ".mjs")
  target_link_options(sbc_wasm PRIVATE
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=createSbcModule
    -sENVIRONMENT=web,worker,node
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=64MB
    -sMAXIMUM_MEMORY=2GB
    -sSTACK_SIZE=1MB
    "-sPTHREAD_POOL_SIZE=Math.max(1,Math.min(((globalThis.navigator&&navigator.hardwareConcurrency)||4)-1,8))"
    -sEXPORTED_RUNTIME_METHODS=wasmMemory
    "-sEXPORTED_FUNCTIONS=@${CMAKE_CURRENT_SOURCE_DIR}/bindings/wasm/exports.txt"
  )
endif()

# ---- Headless CLI ------------------------------------------------------------------
if(SBC_BUILD_CLI)
  add_executable(sbc-cli cli/main.cpp)
  target_link_libraries(sbc-cli PRIVATE sbc)
  target_compile_options(sbc-cli PRIVATE ${SBC_FP_FLAGS})
  if(SBC_IS_WASM)
    # .cjs: Emscripten's Node output is CommonJS, and the web package declares "type": "module".
    set_target_properties(sbc-cli PROPERTIES SUFFIX ".cjs")
    target_link_options(sbc-cli PRIVATE -sENVIRONMENT=node -sALLOW_MEMORY_GROWTH=1 -sPTHREAD_POOL_SIZE=4 -sEXIT_RUNTIME=1 -sNODERAWFS=1)
  endif()
endif()

# ---- Tests -------------------------------------------------------------------------
if(SBC_BUILD_TESTS)
  include(FetchContent)
  FetchContent_Declare(Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.16.0
    GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(Catch2)

  add_executable(sbc_tests
    tests/test_det_math.cpp
    tests/test_freefall.cpp
    tests/test_oscillator.cpp
    tests/test_momentum.cpp
    tests/test_determinism.cpp
    tests/test_rest.cpp
    tests/test_stability.cpp
    tests/test_energy.cpp
    tests/test_beams.cpp
    tests/test_contact.cpp
    tests/test_elements.cpp
    tests/test_vehicle.cpp
  )
  target_link_libraries(sbc_tests PRIVATE sbc Catch2::Catch2WithMain)
  target_compile_options(sbc_tests PRIVATE ${SBC_FP_FLAGS})
  target_compile_definitions(sbc_tests PRIVATE SBC_GOLDEN_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/golden")
  if(SBC_IS_WASM)
    set_target_properties(sbc_tests PROPERTIES SUFFIX ".cjs")
    target_link_options(sbc_tests PRIVATE -sENVIRONMENT=node -sALLOW_MEMORY_GROWTH=1 -sPTHREAD_POOL_SIZE=4 -sEXIT_RUNTIME=1 -sNODERAWFS=1 -sSTACK_SIZE=2MB)
  endif()

  enable_testing()
  if(SBC_IS_WASM)
    add_test(NAME sbc_tests COMMAND node $<TARGET_FILE:sbc_tests>)
  else()
    add_test(NAME sbc_tests COMMAND sbc_tests)
  endif()
endif()
