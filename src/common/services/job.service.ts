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

  async createJob(jobType: JobType, jobData: any) {
    // Validate required fields
    if (!jobType || !jobData) {
      this.logger.error('Missing required fields for job creation', { jobType, jobData });
      throw new Error('Missing required fields for job creation');
    }

    // For ERROR type jobs, set context fields to null since they come from exception filter
    const isErrorJob = jobType === JobType.ERROR;
    
    // Extract context fields based on data structure
    let visitorId = null;
    let ipAddress = null;
    let accountId = null;
    
    if (isErrorJob) {
      // For error jobs, context fields are null
      visitorId = null;
      ipAddress = null;
      accountId = null;
    } else if (jobData.postedPayload) {
      // For regular jobs with postedPayload structure
      visitorId = jobData.postedPayload.visitorId;
      ipAddress = jobData.postedPayload.ipAddress;
      accountId = jobData.postedPayload.accountId;
    } else {
      // Fallback for other structures
      visitorId = jobData.visitorId;
      ipAddress = jobData.ipAddress;
      accountId = jobData.accountId;
    }
    
    // Create job in MongoDB database first
    const jobPayload = {
      type: jobType,
      visitorId: isErrorJob ? null : visitorId,
      accountId: isErrorJob ? null : accountId,
      body: {
        ...jobData,   
        timestamp: new Date(),
      },
      status: JobStatus.PENDING,
      ipAddress: isErrorJob ? null : ipAddress,
    };

    try {
      const job = await this.jobModel.create(jobPayload);
      this.logger.log(`Created job ${job._id} of type ${job.type} with status ${job.status}`);
      return {
        message: 'Job created successfully',
        jobId: job._id,
        type: jobType,
        status: JobStatus.PENDING,
        note: 'Job will be processed by the scheduler',
      };
    } catch (error) {
      this.logger.error('Error creating job:', error);
      throw error; // Let the exception filter handle it
    }
  }

  async getJobsByStatus(status: string, limit: number = 100): Promise<Job[]> {
    try {
      return await this.jobModel
        .find({ status })
        .sort({ createdAt: 1 })
        .limit(limit)
        .exec();
    } catch (error) {
      this.logger.error('Error fetching jobs by status:', error);
      throw error;
    }
  }

  async updateJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
    try {
      const updateData: any = { status };
      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }
      if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
        updateData.processedAt = new Date();
      }

      await this.jobModel.findByIdAndUpdate(jobId, updateData);
      this.logger.log(`Updated job ${jobId} status to ${status}`);
    } catch (error) {
      this.logger.error('Error updating job status:', error);
      throw error;
    }
  }

  async getJobById(jobId: string): Promise<Job | null> {
    try {
      return await this.jobModel.findById(jobId).exec();
    } catch (error) {
      this.logger.error('Error fetching job by ID:', error);
      throw error;
    }
  }

  async getJobsByType(type: JobType, limit: number = 100): Promise<Job[]> {
    try {
      return await this.jobModel
        .find({ type })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      this.logger.error('Error fetching jobs by type:', error);
      throw error;
    }
  }
} 