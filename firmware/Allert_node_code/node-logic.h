#pragma once
#include <stdint.h>
// Unsigned subtraction remains valid across millis() wrap-around.
inline bool allertElapsed(uint32_t now, uint32_t last, uint32_t interval) { return (uint32_t)(now-last) >= interval; }
inline uint32_t allertNextBlock(uint32_t epoch) { return (epoch / 300U + 1U) * 300U; }
inline uint32_t allertBackoff(uint32_t previous) { return previous >= 150000U ? 300000U : previous * 2U; }
inline const char* allertBaseName(const char* path) {
  if (!path) return "";
  const char* base = path;
  for (const char* p = path; *p; ++p) if (*p == '/') base = p + 1;
  return base;
}
