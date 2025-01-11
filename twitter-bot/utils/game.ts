/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/game.json`.
 */
export type Game = {
  "address": "8iMWoGnfjJHCGoYiVF176cQm1SkZVrX2V39RavfED8eX",
  "metadata": {
    "name": "game",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "claimReward",
      "discriminator": [
        149,
        95,
        181,
        242,
        94,
        90,
        158,
        162
      ],
      "accounts": [
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "bidId"
              }
            ]
          }
        },
        {
          "name": "userBid",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "claimer"
              },
              {
                "kind": "arg",
                "path": "bidId"
              }
            ]
          }
        },
        {
          "name": "claimer",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "bidId",
          "type": "string"
        }
      ]
    },
    {
      "name": "createBid",
      "discriminator": [
        234,
        10,
        213,
        160,
        52,
        26,
        91,
        142
      ],
      "accounts": [
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "bidId"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "bidId",
          "type": "string"
        },
        {
          "name": "bidContent",
          "type": "string"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "placeBid",
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "bidId"
              }
            ]
          }
        },
        {
          "name": "userBid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              },
              {
                "kind": "arg",
                "path": "bidId"
              }
            ]
          }
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "bidId",
          "type": "string"
        },
        {
          "name": "vote",
          "type": "bool"
        }
      ]
    },
    {
      "name": "resolveBid",
      "discriminator": [
        44,
        25,
        30,
        6,
        115,
        227,
        130,
        139
      ],
      "accounts": [
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "bidId"
              }
            ]
          }
        },
        {
          "name": "resolver",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "bidId",
          "type": "string"
        },
        {
          "name": "outcome",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bid",
      "discriminator": [
        143,
        246,
        48,
        245,
        42,
        145,
        180,
        88
      ]
    },
    {
      "name": "userBid",
      "discriminator": [
        13,
        209,
        228,
        159,
        155,
        166,
        149,
        53
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized access"
    },
    {
      "code": 6001,
      "name": "bidClosed",
      "msg": "Bid is closed"
    },
    {
      "code": 6002,
      "name": "bidNotResolved",
      "msg": "Bid is not resolved yet"
    },
    {
      "code": 6003,
      "name": "invalidBid",
      "msg": "Invalid bid ID"
    },
    {
      "code": 6004,
      "name": "notAWinner",
      "msg": "You are not a winner"
    },
    {
      "code": 6005,
      "name": "noWinners",
      "msg": "No winners in this bid"
    },
    {
      "code": 6006,
      "name": "noRewardAvailable",
      "msg": "No reward available"
    }
  ],
  "types": [
    {
      "name": "bid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "string"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "content",
            "type": "string"
          },
          {
            "name": "yesVotes",
            "type": "u64"
          },
          {
            "name": "noVotes",
            "type": "u64"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "rewardPerWinner",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "bidStatus"
              }
            }
          },
          {
            "name": "outcome",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "bidStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "userBid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "bidId",
            "type": "string"
          },
          {
            "name": "vote",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
