import { Card, CardHeader, CardBody, CardFooter } from "@nextui-org/react";

function Exam() {
    const json = [
        {
            question:
                "1. Which two statements are characteristics of a virus? (Choose two.)",
            answers: [
                {
                    answer: "A virus typically requires end-user activation.",
                    is_correct: true,
                },
                {
                    answer: "A virus can be dormant and then activate at a specific time or date.",
                    is_correct: true,
                },
                {
                    answer: "A virus replicates itself by independently exploiting vulnerabilities in networks.",
                    is_correct: false,
                },
                {
                    answer: "A virus has an enabling vulnerability, a propagation mechanism, and a payload.",
                    is_correct: false,
                },
                {
                    answer: "A virus provides the attacker with sensitive data, such as passwords",
                    is_correct: false,
                },
            ],
            explanation:
                "Explanation:The type of end user interaction required to launch a virus is typically opening an application, opening a web page, or powering on the computer. Once activated, a virus may infect other files located on the computer or other computers on the same network.",
            images: null,
        },
        {
            question:
                "2. What is a characteristic of a Trojan horse as it relates to network security?",
            answers: [
                {
                    answer: "Too much information is destined for a particular memory block, causing additional memory areas to be affected.",
                    is_correct: false,
                },
                {
                    answer: "Extreme quantities of data are sent to a particular network device interface.",
                    is_correct: false,
                },
                {
                    answer: "An electronic dictionary is used to obtain a password to be used to infiltrate a key network device.",
                    is_correct: false,
                },
                {
                    answer: "Malware is contained in a seemingly legitimate executable program.",
                    is_correct: true,
                },
            ],
            explanation:
                "Explanation:A Trojan horse carries out malicious operations under the guise of a legitimate program. Denial of service attacks send extreme quantities of data to a particular host or network device interface. Password attacks use electronic dictionaries in an attempt to learn passwords. Buffer overflow attacks exploit memory buffers by sending too much information to a host to render the system inoperable.",
            images: null,
        },
        {
            question:
                "3. What technique is used in social engineering attacks?",
            answers: [
                {
                    answer: "sending junk email",
                    is_correct: false,
                },
                {
                    answer: "buffer overflow",
                    is_correct: false,
                },
                {
                    answer: "phishing",
                    is_correct: true,
                },
                {
                    answer: "man-in-the-middle",
                    is_correct: false,
                },
            ],
            explanation:
                "Explanation:A threat actor sends fraudulent email which is disguised as being from a legitimate, trusted source to trick the recipient into installing malware on their device, or to share personal or financial information.",
            images: null,
        },
        {
            question:
                "5. Refer to the exhibit. A cybersecurity analyst is viewing packets forwarded by switch S2. What addresses will identify frames containing data sent from PCA to PCB?",
            answers: null,
            explanation:
                "Explanation:When a message sent from PCA to PCB reaches router R2, some frame header fields will be rewritten by R2 before forwarding to switch S2. The frames will contain the source MAC address of router R2 and the destination MAC address of PCB. The frames will retain the original IPv4 addressing applied by PCA which is the IPv4 address of PCA as the source address and the IPv4 address of PCB as the destination.",
            images: [
                "https://itexamanswers.net/wp-content/uploads/2020/09/5Q.jpg",
            ],
        },
        {
            question:
                "185. Refer to the exhibit. The PC is sending a packet to the Server on the remote network. Router R1 is performing NAT overload. From the perspective of the PC, match the NAT address type with the correct IP address. (Not all options are used.)",
            answers: null,
            explanation:
                "Explanation:The inside local address is the private IP address of the source or the PC in this instance. The inside global address is the translated address of the source or the address as seen by the outside device. Since the PC is using the outside address of the R1 router, the inside global address is 192.0.2.1. The outside addressing is simply the address of the server or 203.0.113.5.",
            images: [
                "https://itexamanswers.net/wp-content/uploads/2019/12/i249830v1n1_212288-1.png",
                "https://itexamanswers.net/wp-content/uploads/2019/12/2020-01-21_005238.jpg",
            ],
        },
    ];

    return (
        <Card>
            <CardBody>
                <p>
                    Make beautiful websites regardless of your design
                    experience.
                </p>
            </CardBody>
        </Card>
    );
}

export default Exam;
