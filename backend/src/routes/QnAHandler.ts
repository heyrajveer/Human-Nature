import { Hono } from "hono";
import {
  PrismaClient,
  User,
  Score,
  Records,
} from "@prisma/client/edge";
import { withAccelerate } from "@prisma/extension-accelerate";
import { decode, sign, verify } from "hono/jwt";
import { getCookie } from "hono/cookie";
export const quest = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
}>();

quest.use("/*", async (c, next) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env?.DATABASE_URL,
  }).$extends(withAccelerate());
  console.log("Cookie checking...");
  const cook = await getCookie(c);
  console.log(cook);

  try {
    if (!cook) {
      return c.json({
        message: "you are not logged in bro",
        loggedIn: false,
      });
    } else if (cook) {
      const verif = await verify(cook.token, c.env.JWT_SECRET);
      if (!verif) {
        return c.json({
          message: "you are not logged in",
          loggedIn: false,
        });
      } else {
        // return c.json({
        //   loggedIn: true,
        // });
        await next();
      }
    }
  } catch (err) {
    return c.json({ message: err });
  }
});

quest.post("/check", async (c) => {
  return c.json({
    message: "checking",
    loggedIn:true,
  });
});

quest.post("/question", async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env?.DATABASE_URL,
  }).$extends(withAccelerate());

  const inputs = await c.req.json();
  const cookies = await getCookie(c, "token");
  const { payload } = await decode(cookies || "");
  const userid: string = payload.id as string;
  console.log(userid);
  console.log(inputs);

  try {
    let Quest: Records = await prisma.records.create({
      data: {
        userId: userid,
      },
    });
    let arr: number[] = [];
    let invalidNumberIndex;
    let donePredicitions = false;
    for (let i = 0; i < inputs.data.length; i++) {
      if (
        inputs.data[i].ans === null ||
        inputs.data[i].ans > 10
      ) {
        invalidNumberIndex = i;
        await prisma.score.deleteMany({
          where: { recordId: Quest.id },
        });
        await prisma.records.delete({
          where: { id: Quest.id },
        });
        return c.json({
          invalidInput: true,
          invalidAtIndex: invalidNumberIndex,
        });
      } else {
        let creating = await prisma.score.create({
          data: {
            recordId: Quest.id,
            inputByUser: inputs.data[i].ans,
          },
        });
        (arr[i] = inputs.data[i].ans),
          console.log(creating);
      }
    }

    const prediction = await fetch(
      "http://localhost:8000/predict",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: arr }),
      }
    );
    const predictionBody: any = await prediction.json();

    const predicts = predictionBody.predicted_labels;
    const set = new Set<number>();
    const array:number[]=[];
    for(let i = 0;i<predicts.length;i++){
      if(!set.has(predicts[i])){
        array.push(predicts[i]);
        await prisma.result.create({data:{
          recordId:Quest.id,
          outputByModel:predicts[i]
        }})
      }
    }

    console.log(predicts);
    donePredicitions = true;
    //console.log(inputs);
    // console.log(Quest);
    // console.log(prediction);
    return c.json({
      message: "success",
      donePredicitions: donePredicitions,
      prediction: array,
    });
  } catch (err) {
    return c.json({ message: err });
  }
});
