import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ApiResponseInterceptor } from "./common/interceptors/api-response.interceptor";
import { ApiRateLimitGuard } from "./common/rate-limit/api-rate-limit.guard";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { CloudinaryModule } from "./media/cloudinary.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { HealthModule } from "./modules/health/health.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SubjectsModule } from "./modules/subjects/subjects.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    // App-wide infrastructure.
    ConfigModule,
    DatabaseModule,
    RedisModule,
    RateLimitModule,
    CloudinaryModule,

    // Features
    HealthModule,
    AuthModule,
    CustomersModule,
    SubjectsModule,
    JobsModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_GUARD, useClass: ApiRateLimitGuard },
  ],
})
export class AppModule {}
