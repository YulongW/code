'use strict';

import path from 'path';
import gulp from 'gulp';
import del from 'del';
import runSequence from 'run-sequence';
import gulpLoadPlugins from 'gulp-load-plugins';
import printSpaceSavings from 'gulp-print-spacesavings';
import merge from 'merge-stream';
import pngquant from 'imagemin-pngquant';
import shell from 'shelljs';
import fs from 'fs';

const $ = gulpLoadPlugins();

// Configurations
const SRC_APP = '/usr/local/app/';
const SRC_STATIC_ROOT = 'assets/';
const SRC_ROOT = SRC_APP + SRC_STATIC_ROOT;
const SRC_CSS = SRC_ROOT + 'css/';
const SRC_JS = SRC_ROOT + 'js/';
const SRC_IMG = SRC_ROOT + 'img/';
const SRC_SVG = SRC_ROOT + 'svg/';
const SRC_SCREENS = SRC_ROOT + 'screens/'

const DEST_ROOT = SRC_APP + 'assets.min/';
const DEST_CSS = DEST_ROOT + 'css/';
const DEST_JS = DEST_ROOT + 'js/';
const DEST_IMG = DEST_ROOT + 'img/';
const DEST_SVG = DEST_ROOT + 'svg/';
const DEST_SCREENS = DEST_ROOT + 'screens/';

const GZIP_OPTIONS = {
  append: false,
  skipGrowingFiles : true
};

const IMG_EXT = '{gif,png,jpg,svg}';

const SIZE_OPTION_BEFORE = {
  title: '  Optimizing',
  showFiles: true,
  showTotal: false
};

const SIZE_OPTION_COPY = {
  title: '  Copying',
  showFiles: true,
  showTotal: false
};

const FILE_REV_MAP_PATH = './data/path_to_rev_map.json';

// styles
gulp.task('styles', () => {
  const AUTOPREFIXER_BROWSERS = [
    'ie >= 10',
    'ie_mob >= 10',
    'ff >= 30',
    'chrome >= 34',
    'safari >= 7',
    'opera >= 23',
    'ios >= 7',
    'android >= 4.4',
    'bb >= 10'
  ];

  return gulp.src([
    SRC_CSS + '**/*.css'
  ])
    .pipe(printSpaceSavings.init())
    .pipe($.changed(DEST_CSS))
    .pipe($.size(SIZE_OPTION_BEFORE))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe($.csso())
    .pipe($.gzip(GZIP_OPTIONS))
    .pipe(printSpaceSavings.print())
    .pipe(gulp.dest(DEST_CSS));
});

// copy unprocessed files
gulp.task('copy', () => {
  const jsStream = gulp.src([
    SRC_JS + '**/*',
    '!' + SRC_JS + '**/*.js'
  ])
    .pipe($.changed(DEST_JS))
    .pipe($.size(SIZE_OPTION_COPY))
    .pipe(gulp.dest(DEST_JS));
    
  const cssStream = gulp.src([
    SRC_CSS + '**/*',
    '!' + SRC_CSS + '**/*.css'
  ])
    .pipe($.changed(DEST_CSS))
    .pipe($.size(SIZE_OPTION_COPY))
    .pipe(gulp.dest(DEST_CSS));
  
  const imgStream = gulp.src([
    SRC_IMG + '**/*',
    '!' + SRC_IMG + '**/*.' + IMG_EXT
  ])
    .pipe($.changed(DEST_IMG))
    .pipe($.size(SIZE_OPTION_COPY))
    .pipe(gulp.dest(DEST_IMG));
  
   return merge(jsStream, cssStream, imgStream);
});

// scripts
gulp.task('scripts', () =>
  gulp.src([
    SRC_JS + '**/*.js'
  ])
    .pipe(printSpaceSavings.init())
    .pipe($.changed(DEST_JS))
    .pipe($.size(SIZE_OPTION_BEFORE))
    /*
    .pipe($.babel())
    .on('error', function(e) {
      console.log('>>> ERROR', e);
      // emit here
      this.emit('end');
    })
    */
    .pipe($.uglify())
    .pipe($.gzip(GZIP_OPTIONS))
    .pipe(printSpaceSavings.print())
    .pipe(gulp.dest(DEST_JS))
);

// images
const optimizeImage = (prevGulpPipe) => {
  return prevGulpPipe
    .pipe($.imagemin([
      $.imagemin.gifsicle({
        interlaced: true,
        optimizationLevel: 3
      }),
      $.imagemin.jpegtran({
        progressive: true
      }),
      pngquant({
        speed: 1
      }),
      $.imagemin.svgo({
        plugins: [{removeViewBox: false}] // for older ie
      })
    ], {
      verbose: true
    }))
    .on('error', function(e) {
      console.log('======= Error ======\n', e);
      this.emit('end');
    })
};

gulp.task('images', () => {
  const imgPipe = gulp.src([
    SRC_IMG + '**/*.' + IMG_EXT
  ])
    .pipe($.changed(DEST_IMG))
    .pipe(printSpaceSavings.init());

  const imgStream = optimizeImage(imgPipe)
    .pipe(printSpaceSavings.print())
    .pipe(gulp.dest(DEST_IMG));

  const svgPipe = gulp.src([
    SRC_SVG + '**/*.svg'
  ])
    .pipe($.changed(DEST_SVG))
    .pipe(printSpaceSavings.init());

  const svgStream = optimizeImage(svgPipe)
    .pipe($.gzip(GZIP_OPTIONS))
    .pipe(printSpaceSavings.print())
    .pipe(gulp.dest(DEST_SVG));
  
  return merge(imgStream, svgStream);
});

const getHeadRevisionNumber = () => {
  const rev = shell.exec(
    `svn info ${SRC_APP} | grep Revision: | awk -F' ' '{print $2}'`,
    { silent: true }
  ).stdout;

  return rev.trim();
};

const getRevisionLog = (rev) => {
  const log = shell.exec(
    `svn log --verbose -r ${rev} ${SRC_APP} | egrep '${SRC_STATIC_ROOT}*.js|css'`,
    { silent: true }
  ).stdout;

  return log.trim();
};

const getRevisionLogMulti = (rev, cnt) => {
  let log = '';
  while(cnt > 0) {
    log += getRevisionLog(rev--)
    --cnt;
  }

  return log.trim();
};

const extractFilePaths = (str) => {
  const re = /\/html\/.*(\/html\/.*)/g;
  const paths = [];
  
  let match = re.exec(str);
  while (match != null) {
    paths.push(match[1]);
    match = re.exec(str);
  }

  return paths;
};

const readFileToRevMap = () => {
  const data = fs.readFileSync(FILE_REV_MAP_PATH);
  return JSON.parse(data); 
};

const writeFileToRevMap = (obj) => {
  const content = JSON.stringify(obj, null, 2);
  fs.writeFile(FILE_REV_MAP_PATH, content, 'utf8', (err) => {
    if (err) {
      console.log(`Failed to save REV map to ${FILE_REV_MAP_PATH}.`);
    }
    console.log(`Successfully saved REV map to ${FILE_REV_MAP_PATH}.`);
  });
};

gulp.task('version', () => {
  let rev = getHeadRevisionNumber();
  
  // get existing path to rev map
  const fileToRevMap = readFileToRevMap();
  
  // update path map - look back 6 revisions
  const LOOK_BACK_REV_CNT = 6;
  
  for (let i = rev - LOOK_BACK_REV_CNT + 1; i <= rev; ++i) {
    const log = getRevisionLog(i); 
    const paths = extractFilePaths(log);

    for (let path of paths) {
      fileToRevMap[path] = {
        rev: i,
        lastUpdatedDate: new Date().toLocaleString()
      };
    }
  }

  // write into screens XML
  let vPipe = gulp.src([
    SRC_SCREENS + '**/*.xml'
  ]);

  Object.keys(fileToRevMap).map(path => {
    const value = fileToRevMap[path];
    rev = value.rev;
    vPipe = vPipe
      .pipe($.replace(path, `${path}?v=${rev}`))
      .pipe($.size({
        // title: `Versioning ${path} in`,
        // showFiles: true,
        showTotal: false
      })
    );
  });

  // save updated path to rev map
  writeFileToRevMap(fileToRevMap);

  return vPipe.pipe(gulp.dest(DEST_SCREENS));
});

// Clean output directory
gulp.task('clean', () => del([DEST_CSS, DEST_JS, DEST_SVG], { dot: true, force: true }));

// Build production files, the default task
gulp.task('default', [/*'clean'*/], cb =>
  runSequence(
    'copy', 'styles', 'scripts', 'version', 'images',
    cb
  )
);

