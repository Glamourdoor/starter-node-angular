// deploy.js
//
// NOTICE!!!! Place script in directory ABOVE the project folder.
// Not IN the project folder...
//
// Execute this script from the directory it is contained. Your target
// project directory should be IN THE FOLDER THIS SCRIPT IS IN!
//

// TODO: Update these values to your EC2 instance values... 
var remoteHost="52.25.127.137";        // Remote EC2 ip address
var remoteUsername= "ubuntu";           // Remote EC2 user/login name
var repoName= "starter-node-angular";      // Project/repo/directory name
var repoNameTemp= repoName + "-temp";   // Temp directory name
var repoNameOLD= repoName + "-OLD";     // OLD directory 
var nodeModulesDir= "node_modules";     // node_modules directory name
var remotePrivateKey= "../finalangular-key.pem";  // Put the RELATIVE path
                                            //  of your Identity file here
var cmd = require('node-cmd');
var fs = require('fs');
var path = require('path');
var node_ssh = require('node-ssh');
var ssh = new node_ssh();

// the method that starts the deployment process
function main() {
	console.log("Deployment started.");
    // NOPE! Don't clone anything. Too distructive. Geez...
    // Just jump straight to sshConnect();
	// cloneRepo();
	sshConnect();
}

// NO LONGER RUN... responsible for cloning the repo
function cloneRepo() {
	console.log("Cloning repo...");
	// delete old copy of repo. Then, clone a fresh copy of repo from GitHub
	cmd.get(
		'cd ~/repos; rm -rf ./hackathon-starter && git clone https://github.com/sahat/hackathon-starter.git',
		function(err, data, stderr){
			console.log("cloneRepo callback\n\t err: " + err + "\n\t data: " + data + "\n\t stderr: " + stderr);
			if(err == null){
			    console.log("No errors in cloneRepo. Trying sshConnect now...");
				sshConnect();
			}
        }
	);
}

// transfers local project to the remote server
function transferProjectToRemote(failed, successful) {
	console.log("##Xfering files from localhost to remote repo-temp folder.");
	return ssh.putDirectory(__dirname + '', repoNameTemp, {
		recursive: true,
		concurrency: 1,
		validate: function(itemPath) {
			const baseName = path.basename(itemPath)
			return baseName.substr(0, 1) !== '.' // do not allow dot files
				&& baseName !== nodeModulesDir // do not allow node_modules
				&& baseName !== 'deploy.js' // this pgm
				&& baseName !== 'deploy.sh' // Don't send shell script
				&& baseName !== 'data' // do not allow data dir
		},
		tick: function(localPath, remotePath, error) {
			if (error) {
			failed.push(localPath)
			console.log("failed.push: " + localPath)
			} else {
			successful.push(localPath)
			console.log("successful.push: " + localPath)
			}
		}
	})
}

// Removes and creates temporary folder on the remote server
function createRemoteTempFolder() {
    let cmd = "/bin/rm -rf " + repoNameTemp + " && mkdir " + repoNameTemp;  
	console.log("##Creating temp folder on remote host with cmd: " + cmd);
	return ssh.execCommand(cmd, { cwd:'/home/ubuntu' })
}

// stops mongodb service on the remote server
// npm will need be stopped manually as it is a foreground process
// (requires a cntl-C).
function stopRemoteServices() {
    let cmd = "sudo service mongod stop";
    cmd += " && sudo service mongod status | grep Active";
	console.log("##Attempting stop of mongo daemon service with cmd: " + cmd);
	return ssh.execCommand(cmd, { cwd:'/home/ubuntu' })
}

// - Removes the repoNameOLD directory.
// - Moves the node_modes dir to the repo-temp folder. Will save reload 
//   because they are big...
// - Remove the repoName dir and rename (mv) the repo-temp to be the new
//   repoName (valid) target with new files. Viola!
function updateRemoteApp() {
    let cmd = "rm -rf " + repoNameOLD;
    cmd += "&& mv " + repoName + "/" + nodeModulesDir + " " + repoNameTemp; 
    cmd += " && mv " + repoName + " " + repoNameOLD;
    cmd += " && mv " + repoNameTemp + " " + repoName;
	console.log("##Attempting folder moves on remote host with cmd: " + cmd);
	return ssh.execCommand(cmd, { cwd:'/home/ubuntu' })
}

// Start mongodb and node services on the remote server
function startRemoteServices() {
    let cmd = "sudo service mongod start";
    cmd += " && sudo service mongod status | grep Active";
	console.log("##Attempting start of mongo daemon service with cmd: " + cmd);
	return ssh.execCommand(cmd, { cwd:'/home/ubuntu' })
}

// connect to the remote server
function sshConnect() {
	console.log("##Connecting to " + remoteHost + " as " + remoteUsername + "...");
	ssh.connect({
		// TODO: ADD YOUR IP ADDRESS BELOW (e.g. '12.34.5.67')
		host: remoteHost,
		username: remoteUsername,
		privateKey: remotePrivateKey
	})
	.then(function() {
		console.log("SSH Connection established.");
        // Careful, createRemoteFolder is destructive! Empty new folder...
		return createRemoteTempFolder();
	})
	.then(function(result) {
        console.log("##After createRemoteTempFolder result object is ", result);
		const failed = []
		const successful = []
		if(result.stdout){ console.log('STDOUT: ' + result.stdout); }
		if(result.stderr || result.code ){
			console.log('STDERR: ' + result.stderr);
            let msg = ", code: " + status.code + " err: " + status.stderr;
			return Promise.reject(msg);
		}
		return transferProjectToRemote(failed, successful);
	})
	.then(function(status) {
        console.log("##After transferProjectToRemote Status is: ", status);
		if (status.stderr || status.code) {
            let msg = ", code: " + status.code + " err: " + status.stderr;
			return Promise.reject(failed.join(msg));
		} else {
			return stopRemoteServices();
		}
	})
	.then(function(status) {
        console.log("##After stopRemoteServices status is: ", status);
		if (status.stderr || status.code) {
            let msg = ", code: " + status.code + " err: " + status.stderr;
			return Promise.reject(failed.join(msg));
		} else {
			return updateRemoteApp();
		}
	})
	.then(function(status) {
        // Weird that this status print is on 1 line and others are not.
        console.log("##After updateRemoteApp Status is: ", status);
		if (status.stderr || status.code) {
            let msg = ", code: " + status.code + " err: " + status.stderr;
			return Promise.reject(failed.join(msg));
		} else {
			return startRemoteServices();
		}
	})
	.then(function(status) {
        console.log("##After startRemoteServices status is: ", status);
        console.log("##Deployment complete.");
		process.exit(0);
	})
	.catch(e => {
		console.log("##FAILED deployment! ", e );
        console.log("##Reasons: ", failed);
		console.error(e);
		process.exit(1);
	})
}

main();

