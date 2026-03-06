
import { ENUMS } from './enums';

// Return the ENUMS object directly and synchronously
export const loadEnums = () => ENUMS;

export const getOptions = (key: keyof typeof ENUMS) => {
    // @ts-ignore
    return ENUMS[key] || [];
};
