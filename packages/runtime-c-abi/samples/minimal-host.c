#include "vivi_runtime.h"

int main(void) {
  ViviVersion min_version = {sizeof(ViviVersion), 0, 0, 0};
  ViviVersion max_version = {sizeof(ViviVersion), 0, 0, 0};
  ViviStatus status =
    vivi_get_supported_spec_version_range(&min_version, &max_version);
  return status == VIVI_OK ? 0 : 1;
}
