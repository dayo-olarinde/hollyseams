import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { CustomerJobsController } from "./customer-jobs.controller";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [AuthModule],
  controllers: [JobsController, CustomerJobsController],
  providers: [JobsService],
})
export class JobsModule {}
