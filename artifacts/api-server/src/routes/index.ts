import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import checkEmailRouter from "./check-email.js";
import userRouter from "./user.js";
import adminRouter from "./admin.js";
import settingsRouter from "./settings.js";
import checkoutRouter from "./checkout.js";
import emailSettingsRouter from "./email-settings.js";
import storageRouter from "./storage.js";
import siteSettingsRouter from "./site-settings.js";
import verifyRouter from "./verify.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(checkEmailRouter);
router.use("/user", userRouter);
router.use("/admin", adminRouter);
router.use("/settings", settingsRouter);
router.use("/user/checkout", checkoutRouter);
router.use("/admin/email-settings", emailSettingsRouter);
router.use(storageRouter);
router.use(siteSettingsRouter);
router.use(verifyRouter);

export default router;
