import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SprintEntity } from '../database/entities/sprint.entity';
import { SprintRepository } from './repositories/sprint.repository';
import { SprintService, SprintsService } from './services/sprint.service';
import { SprintGrpcController, SprintsController } from './controllers/sprint-grpc.controller';
import { IssuesClientModule } from '../grpc/issues-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SprintEntity]),
    IssuesClientModule,
  ],
  controllers: [SprintGrpcController, SprintsController],
  providers: [
    SprintRepository,
    {
      provide: 'ISprintRepository',
      useClass: SprintRepository,
    },
    SprintService,
    SprintsService,
  ],
  exports: [SprintService, SprintsService, SprintRepository, 'ISprintRepository'],
})
export class SprintsModule {}
