import { Module } from '@nestjs/common';
import { KafkaRequestReplyService } from './kafka-request-reply.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [KafkaRequestReplyService],
  exports: [KafkaRequestReplyService],
})
export class KafkaModule {}
