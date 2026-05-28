import "./styles.css";
import {
  collectSampleElements,
  ViviWebSdkBasicDemo,
  type ViviWebSdkBasicTestHooks,
} from "./sdk-demo";

declare global {
  interface Window {
    __viviWebSdkBasic?: ViviWebSdkBasicTestHooks;
  }
}

const demo = new ViviWebSdkBasicDemo(collectSampleElements());
window.__viviWebSdkBasic = demo.getTestHooks();
void demo.mount();
