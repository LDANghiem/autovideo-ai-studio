declare module "ffprobe-static" {
  const ffprobeStatic:
    | string
    | {
        path: string;
        version?: string;
      };

  export default ffprobeStatic;
}