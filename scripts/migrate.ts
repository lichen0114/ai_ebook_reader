import path from "node:path";
import { LocalRepository } from "../src/lib/db/local-repository";

const userData = process.env.MARGIN_READER_USER_DATA ?? path.join(process.cwd(), ".margin-reader-dev");
const repository = new LocalRepository(userData);
repository.close();
console.log(`SQLite library is ready at ${path.join(userData, "library.sqlite")}.`);
