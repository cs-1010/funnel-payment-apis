import { Injectable } from '@nestjs/common';
import { FunnelDto } from './dto/funnel.dto';
import { StickyService } from 'src/common/services/sticky.service';
import { ResponseService } from 'src/common/services/response.service';
import { DieException } from 'src/common/exceptions/die.exception';
import { QueueService } from 'src/queue/queue.service';
import { InjectModel } from '@nestjs/mongoose';
import { Funnel } from './schemas/funnel.schema';
import { Model } from 'mongoose';
import { ActiveCampaignService } from 'src/active-campaign/active-campaign.service';


@Injectable()
export class FunnelService {
    async syncProspectToActiveCampaign(funnelDto: FunnelDto) {
        try {
            // Find the funnel document
            const funnel = await this.funnelModel.findOne({
              cId: funnelDto.cId,
              fname: funnelDto.fname
            });
      
            if (!funnel) {
              throw new Error('Funnel not found');
            }
      
            // Prepare data for ActiveCampaign
            const data: any = {
              email: funnelDto.email,
              [`p[${funnel.prospectListId}]`]: funnel.prospectListId,
              tags: funnelDto.tags ? funnelDto.tags.join(',') : '',
              'field[47,0]': this.generateUniqueId()
            };
      
            // Handle name if provided
            if (funnelDto.firstName) {
              const nameTokens = funnelDto.firstName.split(' ');
              data.firstName = nameTokens[0];
              if (nameTokens.length > 1) {
                data.lastName = nameTokens.slice(1).join(' ');
              }
            }
      
            // Sync contact with ActiveCampaign
            const info = await this.activeCampaignService.syncContact(data);
            console.log('Contact synced with ActiveCampaign:', info);
      
            return info;
          } catch (error) {
            console.error('Error syncing prospect to ActiveCampaign:', error);
            throw error;
          }
    }

    private generateUniqueId(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }

    constructor(private readonly stickyService:StickyService,private readonly responseService:ResponseService,private readonly queueService: QueueService,@InjectModel(Funnel.name) private funnelModel: Model<Funnel>,
    private readonly activeCampaignService: ActiveCampaignService){}


    async process(funnelDto: FunnelDto) {
        let response:any = null;
        
        switch(funnelDto.ptype){
            case 'vsl':
                response = await this.processVsl(funnelDto);
                const prospectId:string|null = response.prospectId ? response.prospectId : null;
                await this.queueService.addTask("/funnel/sync-prospect-custom-fields-and-tags","POST",{...funnelDto,prospectId:prospectId});
                response = await this.syncActiveCampaignTagsIfAny(funnelDto.email? funnelDto.email : null,prospectId,response); 
                break;
        }
        return this.responseService.success(response,"Data processed successfully",200);
    }

    async syncActiveCampaignTagsIfAny(email:string, prospectId:any|null,response:any)
    {
        //
        return response
    }

    async addProspectCustomFields(funnelDto: FunnelDto) {
        const fields = [];
        const fieldMappings = [
            { key: 'rt_rotator_id', id: 21 },
            { key: 'rt_variation_id', id: 12 },
            { key: 'device', id: 39 },
            { key: 'ga4_client_id', id: 9 },
            { key: 'ga4_session_id', id: 10 },
            { key: 'rt_funnel_id', id: 47 },
            { key: 'rt_variation_path', id: 49 },
            { key: 'rt_step_id', id: 48 },
            { key: 'fbclid', id: 55 },
            { key: 'fbpid', id: 57 },
            { key: 'user_agent', id: 59 },
            { key: 'gclid', id: 61 },
            { key: 'rt_params', id: 63 },
            { key: 'rt_funnel_name', id: 65 },
        ];

        fieldMappings.forEach(mapping => {
            if (funnelDto[mapping.key]) {
                fields.push({ id: mapping.id, value: funnelDto[mapping.key] });
            }
        });

        if (funnelDto.quiz_answers) {
            const quizAnswers = JSON.parse(funnelDto.quiz_answers);
            quizAnswers.forEach(answer => {
                fields.push({ id: answer.id, value: answer.value });
            });
        }

        if (fields.length > 0 && funnelDto.prospectId) {
            const data = {
                custom_fields: fields
            };

            await this.stickyService.updateProspectCustomFields(funnelDto.prospectId, data);
        }
    }

    async processVsl(funnelDto: FunnelDto)
    {
       
        return await this.stickyService.findOrCreateProspect({...funnelDto},funnelDto.cId.toString(),funnelDto.ipAddress)
    }
}
