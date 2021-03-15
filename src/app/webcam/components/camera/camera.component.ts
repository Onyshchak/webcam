import {AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, Renderer2, ViewChild} from '@angular/core';

import * as bodyPix from '@tensorflow-models/body-pix';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-converter';
import '@tensorflow/tfjs-backend-webgl';
import { interval, ReplaySubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-camera',
  templateUrl: './camera.component.html',
  styleUrls: ['./camera.component.scss']
})
export class CameraComponent implements OnInit, AfterViewInit, OnDestroy {
  bodyPix = require('@tensorflow-models/body-pix');
  imageBackgrounds: any[] = [];
  selectedBackground: string;
  canvas: any = {};

  @ViewChild('video') video: ElementRef;
  @ViewChild('content') content: ElementRef;
  @ViewChild('camera') camera: ElementRef;
  ngVersion: string;
  streaming = false;
  error: any;
  private stream: MediaStream = null;
  canvasPerson;
  contextPerson;
  canvasResult;
  showResult: boolean;
  loading: boolean;
  backgroundDarkeningMask = null;
  imgData;
  isVertical: boolean;
  private untilDestroy: ReplaySubject<boolean> = new ReplaySubject(1);
  @HostListener('window:resize', ['$event']) onResize(event): void {
    this.resizeContent();
  }

  constructor(
    private renderer: Renderer2
  ) { }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    this.initVideo(null).then((r) => console.log(r));

    this.canvasPerson = document.getElementById('canvasPerson');
    this.canvasResult = document.getElementById('canvasResult');
    this.contextPerson = this.canvasPerson.getContext('2d');

    this.resizeContent();
  }

  ngOnDestroy(): void {
    this.untilDestroy.next(true);
    this.untilDestroy.complete();
  }

  get width(): number {
    return this.isVertical ? 480 : 640;
  }

  get height(): number {
    return this.isVertical ? 640 : 480;
  }

  resizeContent(): void {
    const height = this.camera.nativeElement.offsetHeight;
    const width = this.camera.nativeElement.offsetWidth;
    this.isVertical = height > width && width < 601;
    if (this.isVertical) {
      this.imageBackgrounds = ['assets/img/img-1.jpg', 'assets/img/img-2.jpg', 'assets/img/img-3.jpg'];
      if (height / width > 1.333333333334) {
        this.renderer.setStyle(this.content.nativeElement, 'width', 'inherit');
        this.renderer.setStyle(this.content.nativeElement, 'height', 'inherit');
      } else {
        this.renderer.setStyle(this.content.nativeElement, 'width', (height / 1.777777777777778) + 'px');
        this.renderer.setStyle(this.content.nativeElement, 'height', height + 'px');
      }
    } else {
      this.imageBackgrounds = ['assets/img/img-1.jpg', 'assets/img/img-2.jpg', 'assets/img/img-3.jpg'];
      if (width / height < 1.777777777777778) {
        this.renderer.setStyle(this.content.nativeElement, 'width', 'inherit');
        this.renderer.setStyle(this.content.nativeElement, 'height', 'inherit');
      } else {
        this.renderer.setStyle(this.content.nativeElement, 'width', (height * 1.777777777777778) + 'px');
        this.renderer.setStyle(this.content.nativeElement, 'height', height + 'px');
      }
    }
  }

  async initVideo(e): Promise<any> {
    this.getMediaStream()
      .then(async (stream) => {
        this.stream = stream;
        this.streaming = true;
        const net = await bodyPix.load({
          architecture: 'MobileNetV1',
          outputStride: 16,
          multiplier: 0.75,
          quantBytes: 2
        });
        const intervalObs = interval(100);
        intervalObs.pipe(
          takeUntil(this.untilDestroy)
        ).subscribe(async () => {
          if (this.selectedBackground) {
            const segmentation = await net.segmentPerson(this.video.nativeElement, {
              flipHorizontal: false,
              internalResolution: 'medium',
              segmentationThreshold: 0.7
            });
            const foregroundColor = { r: 0, g: 0, b: 0, a: 255 };
            const backgroundColor = { r: 0, g: 0, b: 0, a: 0 };
            const backgroundDarkeningMask = bodyPix.toMask(segmentation, foregroundColor, backgroundColor, false);
            this.contextPerson.globalCompositeOperation = 'destination-over';
            this.contextPerson.putImageData(backgroundDarkeningMask, 0, 0);
            this.contextPerson.globalCompositeOperation = 'source-in';
            this.contextPerson.drawImage(this.video.nativeElement, 0, 0);
          }
        });
      });
  }
  private getMediaStream(): Promise<MediaStream> {

    const video_constraints = { video: true };
    const _video = this.video.nativeElement;
    return new Promise<MediaStream>((resolve, reject) => {
      // (get the stream)
      return navigator.mediaDevices.
      getUserMedia(video_constraints)
        .then(stream => {
          (window as any).stream = stream; // make variable available to browser console
          _video.srcObject = stream;
          // _video.src = window.URL.createObjectURL(stream);
          _video.onloadedmetadata = function(e: any) { };
          _video.play();
          return resolve(stream);
        })
        .catch(err => reject(err));
    });
  }

  shot(): void {
    const ctx = this.canvasResult.getContext('2d');
    ctx.drawImage(this.video.nativeElement, 0, 0);
    this.imgData = ctx.getImageData(0, 0, this.width, this.height);
    this.loading = true;
    this.loadImage().then(r => {
      this.showResult = true;
      this.loading = false;
    });
  }

  save(): void {
    const link = document.createElement('a');
    link.download = 'filename.png';
    link.href = this.canvasResult.toDataURL();
    link.click();
  }

  change(): void {
    this.showResult = false;
    this.imgData = null;
    const ctx = this.canvasResult.getContext('2d');
    ctx.clearRect(0, 0, this.width, this.height);
  }

  async loadImage(): Promise<any> {
    const net = await bodyPix.load({
      architecture: 'ResNet50',
      outputStride: 16,
      multiplier: 1,
      quantBytes: 1,
    });

    const segmentation = await net.segmentPerson(this.imgData, {
      flipHorizontal: true,
      internalResolution: 'full',
      segmentationThreshold: 0.5,
      maxDetections: 5,
      scoreThreshold: 0.61,
      nmsRadius: 21
    });

    // Convert the segmentation into a mask to darken the background.
    const foregroundColor = { r: 0, g: 0, b: 0, a: 255 };
    const backgroundColor = { r: 0, g: 0, b: 0, a: 0 };
    const backgroundDarkeningMask = bodyPix.toMask(segmentation, foregroundColor, backgroundColor, false);
    this.backgroundDarkeningMask = backgroundDarkeningMask;
    this.composite(backgroundDarkeningMask).then(res => console.log(res));
  }

  async composite(backgroundDarkeningMask): Promise<void> {
    if (!backgroundDarkeningMask) { return; }

    const ctx = this.canvasResult.getContext('2d');
    // composite the segmentation mask on top
    ctx.globalCompositeOperation = 'destination-over';
    ctx.putImageData(backgroundDarkeningMask, 0, 0);
    // composite the frame
    ctx.globalCompositeOperation = 'source-in';
    createImageBitmap(this.imgData).then(imgBitmap => {
      ctx.drawImage(imgBitmap, 0, 0);
      this.imgData = ctx.getImageData(0, 0, this.width, this.height);
      ctx.putImageData(this.imgData, 0, 0);
      const background = new Image(this.width, this.height);
      background.src = this.selectedBackground;
      background.onload = () => {
        ctx.globalCompositeOperation = 'destination-over';
        // ctx.filter = 'blur(2px)';
        ctx.drawImage(background, 0, 0);
      };
    });
  }

  setBackground(url: string): void {
    this.selectedBackground = url;
    if (this.showResult) {
      this.composite(this.backgroundDarkeningMask).then(res => console.log(res));
    }
  }
}
