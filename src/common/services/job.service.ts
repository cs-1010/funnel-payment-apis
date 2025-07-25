import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobDocument } from '../schemas/job.schema';
import { JobStatus, JobType } from '../dto/create-job.dto';

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
  ) {}

  async createJob(jobType:JobType,jobData: any) {

    const { visitorId, ipAddress, accountId } = jobData.postedPayload;
    
    // Validate required fields
    if (!jobType || !jobData) {
      //this.logger.error('Missing required fields for job creation', { type, body });
      throw new Error('Missing required fields for job creation');
    }

    // Create job in MongoDB database first
    const jobPayload = {
      type:jobType,
      visitorId,
      accountId,
      body: {
        ...jobData,   
        timestamp: new Date(),
      },
      status: JobStatus.PENDING,
      ipAddress,
    };

    try {
        const job = await this.jobModel.create(jobPayload);
        this.logger.log(`Created job ${job._id} of type ${job.type} with status ${job.status}`);
        return {
            message: 'Job created successfully',
            jobId: job._id,
            type:jobType,
            status: JobStatus.PENDING,
            note: 'Job will be processed by the scheduler',
          };
      } catch (error) {
        this.logger.error('Error creating job:', error);
        throw error; // Let the exception filter handle it
      }
    
  }

} 