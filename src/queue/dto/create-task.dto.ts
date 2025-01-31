import { IsNotEmpty, IsEnum, IsObject, IsOptional, IsString } from "class-validator"
import { Type } from "class-transformer"

export enum JobType {
    PAGE_VISIT = "PAGE_VISIT",
    PAGE_CLICK = "PAGE_CLICK",
}

export class CreateTaskDto {
    @IsNotEmpty()
    @IsEnum(JobType)
    jobType: JobType

    @IsNotEmpty()
    @IsObject()
    @Type(() => Object)
    body: Record<string, any>


    @IsOptional()
    @IsString()
    visitorId?: string
}

