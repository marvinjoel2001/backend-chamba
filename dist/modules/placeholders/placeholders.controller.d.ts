import { PlaceholdersService } from './placeholders.service';
export declare class PlaceholdersController {
    private readonly placeholdersService;
    constructor(placeholdersService: PlaceholdersService);
    listPlannedApiAreas(): {
        area: string;
        status: string;
        notes: string;
    }[];
}
