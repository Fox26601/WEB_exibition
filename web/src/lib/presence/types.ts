export type PresencePose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export type RemotePresencePose = PresencePose & {
  actorNr: number;
  updatedAt: number;
};
