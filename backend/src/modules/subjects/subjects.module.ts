import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { CustomerSubjectsController } from "./customer-subjects.controller";
import { SubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";

@Module({
  imports: [AuthModule],
  controllers: [SubjectsController, CustomerSubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
