import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePersonalityProfileDto } from './create-personality-profile.dto';

/**
 * DTO for updating an existing personality profile
 * All fields are optional to support partial updates
 */
export class UpdatePersonalityProfileDto extends PartialType(CreatePersonalityProfileDto) {
  @ApiPropertyOptional({
    description: 'Whether to increment the version number (recommended for significant changes)',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  incrementVersion?: boolean;
}
