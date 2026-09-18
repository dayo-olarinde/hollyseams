import { Controller, Get } from "@nestjs/common";

import { ApiResponse } from "../../common/http/api-response";
import { HealthService, type HealthData } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<ApiResponse<HealthData>> {
    return this.health.check();
  }
}
