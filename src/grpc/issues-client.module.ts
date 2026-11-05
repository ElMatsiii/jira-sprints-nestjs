import { Module } from '@nestjs/common';
import { IssuesClientService, IssuesGrpcClient } from './clients/issues-client.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [
    IssuesClientService,
    IssuesGrpcClient,
    {
      provide: 'IIssuesClient',
      useExisting: IssuesClientService,
    },
  ],
  exports: [IssuesClientService, IssuesGrpcClient, 'IIssuesClient'],
})
export class IssuesClientModule {}
