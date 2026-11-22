declare module "photon-realtime" {
  const Photon: {
    setOnLoad: (cb: () => void) => void;
    ConnectionProtocol: { Ws: number; Wss: number };
    LoadBalancing: {
      LoadBalancingClient: {
        new (
          protocol: number,
          appId: string,
          appVersion: string,
        ): PhotonLoadBalancingClient;
        State: {
          Error: number;
          Uninitialized: number;
          JoinedLobby: number;
          Joined: number;
          Disconnected: number;
        };
        StateToName: (state: number) => string;
      };
      Constants: {
        ErrorCode: {
          Ok: number;
          GameFull: number;
          MaxCcuReached: number;
          ServerFull: number;
        };
        ReceiverGroup: { Others: number; All: number; MasterClient: number };
        CustomAuthenticationType: { None: number };
      };
    };
    PhotonPeer: {
      setWebSocketImpl: (impl: unknown) => void;
    };
  };

  export type PhotonLoadBalancingClient = {
    onStateChange: ((state: number) => void) | null;
    onEvent: ((code: number, content: unknown, actorNr: number) => void) | null;
    onError: ((errorCode: number, errorMsg: string) => void) | null;
    onActorJoin: ((actor: PhotonActor) => void) | null;
    onActorLeave: ((actor: PhotonActor, cleanup: boolean) => void) | null;
    onJoinRoom: (() => void) | null;
    setUserId: (id: string) => void;
    connectToRegionMaster: (region: string) => boolean;
    disconnect: () => void;
    joinRoom: (
      roomName: string,
      joinOptions?: { createIfNotExists?: boolean },
      createOptions?: { maxPlayers?: number; isVisible?: boolean; isOpen?: boolean },
    ) => boolean;
    leaveRoom: () => void;
    raiseEvent: (
      code: number,
      data: unknown,
      options?: { receivers?: number },
    ) => void;
    isJoinedToRoom: () => boolean;
    myActor: () => PhotonActor;
    myRoomActors: () => Record<string, PhotonActor>;
    myRoomActorCount: () => number;
  };

  export type PhotonActor = {
    actorNr: number;
    isLocal: boolean;
    userId?: string;
  };

  export default Photon;
}
