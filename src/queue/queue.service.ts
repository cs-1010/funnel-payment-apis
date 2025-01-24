import { Injectable, Logger, type OnModuleInit } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"
import { Job, type JobDocument } from "./schemas/job.schema"
import * as fs from "fs/promises"
import * as path from "path"

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name)
  private readonly failedJobsDir: string
  private readonly retryInterval: number = 5 * 60 * 1000; // 1 minute for testing purposes

  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>
  ) {
    this.failedJobsDir = path.join(process.cwd(), 'failed-jobs');
  }

  async onModuleInit() {
    await this.ensureFailedJobsDir()
    this.startRetryProcess()
  }

  async addJob(type: string, body: any): Promise<JobDocument | null> {
    const newJob = new this.jobModel({ type, body, status: "pending" })
    try {

      return await newJob.save()
    } catch (error) {
      this.logger.error(`Failed to add job to database: ${error.message}`)
      await this.saveFailedJobToFile(newJob)
      return null
    }
  }

  private async ensureFailedJobsDir() {
    try {
      await fs.mkdir(this.failedJobsDir, { recursive: true })
    } catch (error) {
      this.logger.error(`Failed to create failed jobs directory: ${error.message}`)
    }
  }

  private async saveFailedJobToFile(job: JobDocument) {
    const fileName = `${Date.now()}-${job._id}.json`
    const filePath = path.join(this.failedJobsDir, fileName)
    try {
      await fs.writeFile(filePath, JSON.stringify(job.toJSON()))
      this.logger.log(`Failed job saved to file: ${fileName}`)
    } catch (error) {
      this.logger.error(`Failed to save job to file: ${error.message}`)
    }
  }

  private startRetryProcess() {
    setInterval(() => this.retryFailedJobs(), this.retryInterval)
    this.logger.log("Retry process started")
  }

  private async retryFailedJobs() {
    this.logger.log("Retrying failed jobs...")
    const files = await fs.readdir(this.failedJobsDir)
    this.logger.log(`Found ${files.length} failed job(s)`)

    for (const file of files) {
      const filePath = path.join(this.failedJobsDir, file)
      try {
        const jobData = JSON.parse(await fs.readFile(filePath, "utf-8"))
        const newJob = new this.jobModel(jobData)
        await newJob.save()
        await fs.unlink(filePath)
        this.logger.log(`Successfully retried and added job from file: ${file}`)
      } catch (error) {
        this.logger.error(`Failed to retry job from file ${file}: ${error.message}`)
      }
    }
  }


}

